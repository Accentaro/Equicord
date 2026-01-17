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

type MediaElement = HTMLImageElement | HTMLVideoElement;

interface MediaDetails {
    element: MediaElement;
    width: number;
    height: number;
    url: string;
}

const URL_KEYWORDS = ["url", "src", "proxy"];
const URL_CONTAINER_KEYS = ["gif", "media", "image", "video", "thumbnail", "preview", "result", "item"];

function normalizeUrl(url: string) {
    if (url.startsWith("//")) return `https:${url}`;
    return url;
}

function looksLikeUrl(value: string) {
    return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("//");
}

function findMediaElement(trigger: HTMLElement): MediaElement | null {
    const container = trigger.closest("li") ?? trigger.closest('[role="listitem"]') ?? trigger.parentElement;
    const video = container?.querySelector("video") as HTMLVideoElement | null;
    if (video) return video;
    return container?.querySelector("img") as HTMLImageElement | null;
}

function getElementUrl(element: MediaElement): string | null {
    if (element instanceof HTMLVideoElement) {
        return element.currentSrc || element.src || element.getAttribute("src");
    }
    return element.currentSrc || element.src || element.getAttribute("src");
}

function applyTenorMp4Fix(url: string, isGif: boolean) {
    if (isGif) return url;
    try {
        const host = new URL(url).host;
        if (!host.endsWith("tenor.com")) return url;
    } catch {
        return url;
    }

    const typeIndex = url.lastIndexOf("/") - 1;
    if (typeIndex <= 0 || url[typeIndex] === "o") return url;
    return url.slice(0, typeIndex) + "o" + url.slice(typeIndex + 1);
}

function collectCandidateUrls(source: any, depth = 0, out = new Set<string>()) {
    if (!source || depth > 2) return out;
    if (typeof source === "string") {
        if (looksLikeUrl(source)) out.add(normalizeUrl(source));
        return out;
    }
    if (Array.isArray(source)) {
        for (const entry of source) collectCandidateUrls(entry, depth + 1, out);
        return out;
    }
    if (typeof source !== "object") return out;

    for (const [key, value] of Object.entries(source)) {
        const keyLower = key.toLowerCase();
        if (typeof value === "string") {
            if (looksLikeUrl(value) && URL_KEYWORDS.some(keyword => keyLower.includes(keyword))) {
                out.add(normalizeUrl(value));
            }
            continue;
        }
        if (value && typeof value === "object" && URL_CONTAINER_KEYS.some(keyword => keyLower.includes(keyword))) {
            collectCandidateUrls(value, depth + 1, out);
        }
    }

    return out;
}

function scoreUrl(url: string) {
    let host = "";
    try {
        host = new URL(url).host;
    } catch {}

    let score = 0;
    if (host.endsWith("discordapp.net") || host.endsWith("discordapp.com")) score += 100;
    if (host.includes("images-ext")) score += 20;
    if (host.includes("media.discordapp.net") || host.includes("cdn.discordapp.com")) score += 10;
    if (host.endsWith("klipy.com")) score += 5;
    if (host.endsWith("tenor.com")) score += 5;
    if (url.includes(".gif")) score += 1;
    return score;
}

function orderCandidateUrls(preferred: string | null, candidates: Set<string>) {
    const all = Array.from(candidates);
    if (!all.length) return [];

    const rest = preferred ? all.filter(url => url !== preferred) : all;
    rest.sort((a, b) => scoreUrl(b) - scoreUrl(a));

    return preferred ? [preferred, ...rest] : rest;
}

function isLikelyVideoUrl(url: string) {
    return /\.(webm|mp4|m4v)(\?|$)/i.test(url);
}

async function resolveExistingMedia(element: MediaElement): Promise<MediaDetails | null> {
    const elementUrl = getElementUrl(element);
    if (!elementUrl) return null;
    const url = normalizeUrl(elementUrl);

    if (element instanceof HTMLImageElement) {
        if (element.complete && element.naturalWidth) {
            return { element, width: element.naturalWidth, height: element.naturalHeight, url };
        }
        return await new Promise(resolve => {
            element.addEventListener("load", () => {
                resolve({ element, width: element.naturalWidth, height: element.naturalHeight, url });
            }, { once: true });
            element.addEventListener("error", () => resolve(null), { once: true });
        });
    }

    if (element.readyState >= 1 && element.videoWidth) {
        return { element, width: element.videoWidth, height: element.videoHeight, url };
    }

    return await new Promise(resolve => {
        element.addEventListener("loadedmetadata", () => {
            resolve({ element, width: element.videoWidth, height: element.videoHeight, url });
        }, { once: true });
        element.addEventListener("error", () => resolve(null), { once: true });
    });
}

async function createMediaFromUrl(url: string, preferVideo: boolean): Promise<MediaDetails | null> {
    const normalizedUrl = normalizeUrl(url);
    if (!preferVideo) {
        const image = new Image();
        image.src = normalizedUrl;
        return await new Promise(resolve => {
            image.addEventListener("load", () => {
                resolve({ element: image, width: image.naturalWidth, height: image.naturalHeight, url: normalizedUrl });
            }, { once: true });
            image.addEventListener("error", () => resolve(null), { once: true });
        });
    }

    const video = document.createElement("video");
    video.src = normalizedUrl;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.load();

    return await new Promise(resolve => {
        video.addEventListener("loadedmetadata", () => {
            resolve({ element: video, width: video.videoWidth, height: video.videoHeight, url: normalizedUrl });
        }, { once: true });
        video.addEventListener("error", () => resolve(null), { once: true });
    });
}

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

function showCaptioner(
    width: number,
    height: number,
    element: HTMLElement,
    onConfirm: (transform: GifTransform) => void
) {
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
        const directUrl = typeof instance.props.src === "string" ? instance.props.src : null;

        return (
            <button
                className="gc-trigger gc-trigger-icon"
                onClick={async (e: React.MouseEvent) => {
                    e.stopPropagation();
                    const trigger = e.currentTarget as HTMLElement;
                    const existingElement = findMediaElement(trigger);
                    const elementUrl = existingElement ? getElementUrl(existingElement) : null;
                    const normalizedElementUrl = elementUrl ? normalizeUrl(elementUrl) : null;
                    const existingMedia = existingElement ? await resolveExistingMedia(existingElement) : null;

                    const candidates = collectCandidateUrls(instance.props);
                    const adjustedCandidates = new Set<string>();
                    if (normalizedElementUrl) adjustedCandidates.add(normalizedElementUrl);
                    if (existingMedia?.url) adjustedCandidates.add(existingMedia.url);
                    if (directUrl) adjustedCandidates.add(applyTenorMp4Fix(normalizeUrl(directUrl), isGif));
                    for (const candidate of candidates) {
                        adjustedCandidates.add(applyTenorMp4Fix(candidate, isGif));
                    }

                    const preferredUrl = existingMedia?.url ?? normalizedElementUrl ?? (directUrl ? applyTenorMp4Fix(normalizeUrl(directUrl), isGif) : null);
                    const orderedUrls = orderCandidateUrls(preferredUrl, adjustedCandidates);
                    const primaryUrl = orderedUrls[0];
                    const media = existingMedia ?? (
                        primaryUrl
                            ? await createMediaFromUrl(primaryUrl, !isGif || isLikelyVideoUrl(primaryUrl))
                            : null
                    );

                    if (!media) {
                        showError("Failed to load gif");
                        return;
                    }

                    showCaptioner(media.width, media.height, media.element, transform => {
                        const render = media.element instanceof HTMLVideoElement ? captionMp4 : captionGif;
                        render(orderedUrls.length ? orderedUrls : media.url, media.width, media.height, transform);
                    });
                }}
            >
                <PencilIcon size="xs" color="black" fill="black" />
            </button>
        );
    },

});
