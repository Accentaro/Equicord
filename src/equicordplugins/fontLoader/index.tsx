/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings, migratePluginSetting } from "@api/Settings";
import { Card } from "@components/Card";
import { HeadingSecondary, HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { debounce } from "@shared/debounce";
import { EquicordDevs } from "@utils/constants";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { React, TextInput, Select } from "@webpack/common";

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

const createGoogleFontUrl = (family: string, options = "") =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}${options}&display=swap`;

const loadFontStyle = (url: string) => {
    document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${url}">`);
    return document.createElement("style");
};

async function searchGoogleFonts(query: string) {
    try {
        const response = await fetch("https://fonts.google.com/$rpc/fonts.fe.catalog.actions.metadata.MetadataService/FontSearch", {
            method: "POST",
            headers: {
                "content-type": "application/json+protobuf",
                "x-user-agent": "grpc-web-javascript/0.1"
            },
            body: JSON.stringify([[query, null, null, null, null, null, 1], [5], null, 16])
        });

        const data = await response.json();
        if (!data?.[1]) return [];
        return data[1].map(([_, fontData]: [string, any[]]) => ({
            family: fontData[0],
            displayName: fontData[1],
            authors: fontData[2],
            category: fontData[3],
            variants: fontData[6].map((variant: any[]) => ({
                axes: variant[0].map(([tag, min, max]: [string, number, number]) => ({
                    tag, min, max
                }))
            }))
        }));
    } catch (err) {
        console.error("Failed to fetch fonts:", err);
        return [];
    }
}

const preloadFont = (family: string) =>
    loadFontStyle(createGoogleFontUrl(family, "&text=The quick brown fox jumps over the lazy dog"));

// Cache for fonts - populated on plugin load
let cachedFonts: GoogleFontMetadata[] | null = null;
let fontsPromise: Promise<GoogleFontMetadata[]> | null = null;

async function fetchAllGoogleFonts(): Promise<GoogleFontMetadata[]> {
    // Return cached fonts if available
    if (cachedFonts !== null) {
        return cachedFonts;
    }
    
    // If already fetching, return the existing promise
    if (fontsPromise !== null) {
        return fontsPromise;
    }
    
    // Use Grida Fonts API (public, no auth, provides all Google Fonts)
    fontsPromise = (async () => {
        try {
            const gridaResponse = await fetch("https://fonts.grida.co/webfonts.json");
            if (gridaResponse.ok) {
                const gridaData = await gridaResponse.json();
                if (gridaData?.items && Array.isArray(gridaData.items)) {
                    // Filter out fonts that might cause errors - validate font names
                    const validFonts = gridaData.items
                        .filter((font: any) => {
                            if (!font.family) return false;
                            const name = font.family;
                            if (!name || name.length === 0 || name.length > 100) return false;
                            // Allow letters, numbers, spaces, hyphens, underscores, and apostrophes
                            if (!/^[a-zA-Z0-9\s\-_']+$/.test(name)) return false;
                            return true;
                        })
                        .map((font: any) => ({
                            family: font.family,
                            displayName: font.family,
                            authors: [],
                            category: 0,
                            popularity: 0,
                            variants: []
                        }));
                    
                    cachedFonts = validFonts;
                    return validFonts;
                }
            }
        } catch (err) {
            console.error("Failed to fetch fonts from Grida:", err);
        }
        
        cachedFonts = [];
        return [];
    })();
    
    return fontsPromise;
}

let styleElement: HTMLStyleElement | null = null;

const applyFont = async (fontFamily: string) => {
    if (!fontFamily) {
        styleElement?.remove();
        styleElement = null;
        return;
    }

    try {
        if (!styleElement) {
            styleElement = document.createElement("style");
            document.head.appendChild(styleElement);
        }

        loadFontStyle(createGoogleFontUrl(fontFamily, ":wght@300;400;500;600;700"));
        styleElement.textContent = `
            * {
                --font-primary: '${fontFamily}', sans-serif !important;
                --font-display: '${fontFamily}', sans-serif !important;
                --font-headline: '${fontFamily}', sans-serif !important;
                ${settings.store.applyOnCodeBlocks ? "--font-code: '${fontFamily}', monospace !important;" : ""}
            }
        `;
    } catch (err) {
        console.error("Failed to load font:", err);
    }
};

function GoogleFontSelect({ onSelect }: { onSelect: (font: GoogleFontMetadata) => void; }) {
    const [fonts] = React.useState<GoogleFontMetadata[]>(cachedFonts || []);
    const [selectedFont, setSelectedFont] = React.useState<string | null>(null);
    const loadedFonts = React.useRef(new Set<string>());

    const options = fonts.map(font => ({
        label: font.displayName,
        value: font.family,
        key: font.family
    }));

    const handleSelect = (fontFamily: string) => {
        setSelectedFont(fontFamily);
        const font = fonts.find(f => f.family === fontFamily);
        if (font) {
            onSelect(font);
        }
    };

    const renderOptionLabel = React.useCallback((option: { label: string; value: string }) => {
        // Lazy load font CSS when it's rendered in the dropdown
        if (!loadedFonts.current.has(option.value)) {
            const url = createGoogleFontUrl(option.value);
            // Check if already loaded
            const existingLink = document.querySelector(`link[href="${url}"]`);
            if (!existingLink) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = url;
                link.onerror = () => {
                    // Silently fail - remove the link on error and mark as failed
                    try { link.remove(); } catch {}
                    loadedFonts.current.add(option.value); // Mark as attempted to avoid retries
                };
                document.head.appendChild(link);
            }
            loadedFonts.current.add(option.value);
        }
        
        return (
            <span style={{ fontFamily: `"${option.value}", sans-serif` }}>
                {option.label}
            </span>
        );
    }, []);

    return (
        <section>
            <HeadingSecondary>Select Google Font</HeadingSecondary>
            <Paragraph>Choose a font from the dropdown below.</Paragraph>
            <div className={Margins.top16}>
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
            </div>
        </section>
    );
}

migratePluginSetting("FontLoader", "applyOnCodeBlocks", "applyOnClodeBlocks");
const settings = definePluginSettings({
    selectedFont: {
        type: OptionType.STRING,
        description: "Currently selected font",
        default: "",
        hidden: true
    },
    fontSearch: {
        type: OptionType.COMPONENT,
        description: "Select Google Fonts",
        component: () => (
            <GoogleFontSelect
                onSelect={font => {
                    settings.store.selectedFont = font.family;
                    applyFont(font.family);
                }}
            />
        )
    },
    applyOnCodeBlocks: {
        type: OptionType.BOOLEAN,
        description: "Apply the font to code blocks",
        default: false
    }
});

export default definePlugin({
    name: "FontLoader",
    description: "Loads any font from Google Fonts",
    authors: [EquicordDevs.vmohammad, EquicordDevs.benjii],
    settings,

    async start() {
        // Fetch and cache fonts on plugin load
        await fetchAllGoogleFonts();
        
        const savedFont = settings.store.selectedFont;
        if (savedFont) {
            await applyFont(savedFont);
        }
    },

    stop() {
        if (styleElement) {
            styleElement.remove();
            styleElement = null;
        }
    }
});
