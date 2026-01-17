/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Credits: https://github.com/TheLazySquid
// Ported from https://github.com/TheLazySquid/BetterDiscordPlugins/blob/51dc41a193c1cf3ac6c28916f2dcef81fe073417/plugins/GifCaptioner/GifCaptioner.plugin.js

import "./styles.css";

import { EquicordDevs } from "@utils/constants";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { ExpressionPickerStore, React, Select } from "@webpack/common";

import captionGif from "./render/gif";
import type { GifTransform } from "./render/gifRenderer";
import captionMp4 from "./render/mp4";
import Modal from "./ui/modal";
import { showError } from "./ui/statusCard";

const PencilIcon = findComponentByCodeLazy("0-2.82 0l-1.38 1.38a1");

interface GoogleFontMetadata {
    family: string;
    displayName: string;
    authors: string[];
    category?: number;
    popularity?: number;
    variants: Array<{
        axes: Array<{
            tag: string;
            min: number;
            max: number;
        }>;
    }>;
}

export const createGoogleFontUrl = (family: string, options = "") =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}${options}&display=swap`;

// Cache for fonts - populated on plugin load
let cachedFonts: GoogleFontMetadata[] | null = null;
let fontsPromise: Promise<GoogleFontMetadata[]> | null = null;
let currentFont = "Arial";

async function fetchAllGoogleFonts(): Promise<GoogleFontMetadata[]> {
    if (cachedFonts !== null) {
        return cachedFonts;
    }

    if (fontsPromise !== null) {
        return fontsPromise;
    }

    fontsPromise = fetch("https://fonts.google.com/$rpc/fonts.fe.catalog.actions.metadata.MetadataService/FontSearch", {
        method: "POST",
        headers: {
            "content-type": "application/json+protobuf",
            "x-user-agent": "grpc-web-javascript/0.1"
        },
        body: JSON.stringify([["", null, null, null, null, null, 1], [5], null, 400])
    })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            const rows = Array.isArray(data?.[1]) ? (data[1] as Array<[string, any[]]>) : [];
            const fonts: GoogleFontMetadata[] = [];

            for (const row of rows) {
                const fontData = row?.[1];
                if (!Array.isArray(fontData)) continue;

                const family = typeof fontData[0] === "string" ? fontData[0] : "";
                if (!family || family.length > 100) continue;
                if (!/^[a-zA-Z0-9\s\-_']+$/.test(family)) continue;

                const displayName = typeof fontData[1] === "string" ? fontData[1] : family;
                const authors = Array.isArray(fontData[2])
                    ? fontData[2].filter((author: unknown): author is string => typeof author === "string")
                    : [];
                const category = typeof fontData[3] === "number" ? fontData[3] : undefined;
                const variants = Array.isArray(fontData[6])
                    ? fontData[6].map((variant: any[]) => {
                        const axesSource = Array.isArray(variant?.[0]) ? variant[0] : [];
                        const axes = axesSource
                            .map((axis: any[]) => {
                                const tag = axis?.[0];
                                const min = axis?.[1];
                                const max = axis?.[2];
                                if (typeof tag !== "string" || typeof min !== "number" || typeof max !== "number") return null;
                                return { tag, min, max };
                            })
                            .filter((axis): axis is { tag: string; min: number; max: number } => axis !== null);
                        return { axes };
                    })
                    : [];

                fonts.push({
                    family,
                    displayName,
                    authors,
                    category,
                    popularity: 0,
                    variants
                });
            }

            fonts.sort((a, b) => a.family.localeCompare(b.family));

            cachedFonts = fonts;
            return fonts;
        })
        .catch(() => {
            cachedFonts = [];
            return cachedFonts;
        });

    return fontsPromise;
}

export function loadGoogleFont(fontFamily: string) {
    const url = createGoogleFontUrl(fontFamily);
    // Check if already loaded
    const existingLink = document.querySelector(`link[href="${url}"]`);
    if (!existingLink) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        link.onerror = () => link.remove();
        document.head.appendChild(link);
    }
}

export function getSelectedFont(): string {
    return currentFont;
}

export function FontSelector({ onSelect }: { onSelect: (font: GoogleFontMetadata) => void; }) {
    const [fonts, setFonts] = React.useState<GoogleFontMetadata[]>(() => {
        // Get all fonts from cache if available
        if (cachedFonts) {
            return cachedFonts;
        }
        return [];
    });
    const [selectedFont, setSelectedFont] = React.useState<string | null>(currentFont !== "Arial" ? currentFont : null);
    const loadedFonts = React.useRef(new Set<string>());

    React.useEffect(() => {
        // If fonts aren't cached yet, fetch them
        if (!cachedFonts) {
            fetchAllGoogleFonts().then(fetchedFonts => {
                setFonts(fetchedFonts);
            });
        }
    }, []);

    const options = fonts.map(font => ({
        label: font.displayName,
        value: font.family,
        key: font.family
    }));

    const handleSelect = (fontFamily: string) => {
        setSelectedFont(fontFamily);
        currentFont = fontFamily;
        const font = fonts.find(f => f.family === fontFamily);
        if (font) {
            loadGoogleFont(fontFamily);
            onSelect(font);
        }
    };

    const renderOptionLabel = React.useCallback((option: { label: string; value: string }) => {
        if (!loadedFonts.current.has(option.value)) {
            loadGoogleFont(option.value);
            loadedFonts.current.add(option.value);
        }

        return (
            <span style={{ fontFamily: `"${option.value}", sans-serif` }}>
                {option.label}
            </span>
        );
    }, []);

    if (fonts.length === 0) {
        return <div>Loading fonts...</div>;
    }

    return (
        <Select
            placeholder="Select a font..."
            options={options}
            maxVisibleItems={10}
            closeOnSelect={true}
            select={handleSelect}
            isSelected={v => v === selectedFont}
            serialize={v => String(v)}
            renderOptionLabel={renderOptionLabel}
        />
    );
}

function showCaptioner(width: number, height: number, element: HTMLElement, onConfirm: (transform: GifTransform) => void) {
    let submitCallback: () => GifTransform;

    openModal(modalProps => (
        <Modal
            {...modalProps}
            width={width}
            element={element}
            onSubmit={cb => submitCallback = cb}
            onConfirm={transform => {
                ExpressionPickerStore.closeExpressionPicker();
                if (transform) {
                    onConfirm(transform);
                    return;
                }
                const res = submitCallback?.();
                if (res) onConfirm(res);
            }}
        />
    ));
}

export default definePlugin({
    name: "GifCaptioner",
    description: "Add captions to GIFs in the gif picker",
    authors: [EquicordDevs.benjii],

    patches: [
        {
            find: "renderGIF",
            replacement: {
                match: /(children:\[)(\w+\([^)]+\)\?null:this\.renderGIF\(\))/,
                replace: "$1$self.renderCaptionButton(this),$2"
            }
        }
    ],

    async start() {
        await fetchAllGoogleFonts();
    },

    renderCaptionButton(instance: any) {
        if (!instance?.props) return null;

        const isGif = instance.props.format === 1;
        const url = instance.props.src;

        if (!url) return null;

        return (
            <button
                className="gc-trigger gc-trigger-icon"
                onClick={async (e: React.MouseEvent) => {
                    e.stopPropagation();
                    let finalUrl = url;

                    // For some reason tenor urls have an id that ends with "o" for mp4
                    if (!isGif) {
                        const typeIndex = finalUrl.lastIndexOf("/") - 1;
                        finalUrl = finalUrl.slice(0, typeIndex) + "o" + finalUrl.slice(typeIndex + 1);
                    }

                    // Fix errors caused by protocol-relative urls
                    if (finalUrl.startsWith("//")) finalUrl = finalUrl.replace("//", "https://");

                    if (isGif) {
                        const image = document.createElement("img");
                        image.src = finalUrl;

                        image.addEventListener("load", () => {
                            const { width, height } = image;
                            showCaptioner(width, height, image, transform => {
                                captionGif(finalUrl, width, height, transform);
                            });
                        });
                        image.addEventListener("error", () => {
                            showError("Failed to load gif");
                        });
                    } else {
                        const video = document.createElement("video");
                        video.src = finalUrl;
                        video.autoplay = true;
                        video.loop = true;
                        video.muted = true;
                        video.load();

                        video.addEventListener("canplaythrough", () => {
                            const { videoWidth, videoHeight } = video;
                            showCaptioner(videoWidth, videoHeight, video, transform => {
                                captionMp4(finalUrl, videoWidth, videoHeight, transform);
                            });
                        }, { once: true });
                        video.addEventListener("error", () => {
                            showError("Failed to load gif");
                        });
                    }
                }}
            >
                <PencilIcon size="xs" color="black" fill="black" />
            </button>
        );
    },

});
