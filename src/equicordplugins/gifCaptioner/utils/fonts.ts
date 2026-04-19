/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchMedia } from "./fetchMedia";

const loadedFontFamilies = new Set<string>(["Arial"]);
const loadingFontFamilies = new Map<string, Promise<void>>();
const fontObjectUrls = new Set<string>();

export const createGoogleFontUrl = (family: string, options = "") =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}${options}&display=swap`;

export function getFontFamilyCss(fontFamily: string) {
    const escaped = fontFamily.trim().replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    return `"${escaped || "Arial"}", sans-serif`;
}

export function getCanvasFont(size: number, fontFamily: string) {
    return `${size}px ${getFontFamilyCss(fontFamily)}`;
}

function parseFontFaces(css: string) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const fontDisplays = new Set<FontDisplay>(["auto", "block", "fallback", "optional", "swap"]);

    return Array.from(sheet.cssRules)
        .filter((rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE)
        .map(rule => {
            const src = rule.style.getPropertyValue("src");
            const url = src.match(/url\((["']?)(.*?)\1\)/)?.[2];
            if (!url) return null;

            return {
                descriptors: {
                    display: fontDisplays.has(rule.style.getPropertyValue("font-display") as FontDisplay)
                        ? rule.style.getPropertyValue("font-display") as FontDisplay
                        : "swap",
                    stretch: rule.style.getPropertyValue("font-stretch") || undefined,
                    style: rule.style.getPropertyValue("font-style") || "normal",
                    unicodeRange: rule.style.getPropertyValue("unicode-range") || undefined,
                    weight: rule.style.getPropertyValue("font-weight") || "400"
                } satisfies FontFaceDescriptors,
                url
            };
        })
        .filter((face): face is NonNullable<typeof face> => face !== null);
}

async function fetchText(url: string) {
    const result = await fetchMedia(url);
    if (!result) return null;

    return new TextDecoder().decode(result.buffer);
}

async function loadFontFace(family: string, url: string, descriptors: FontFaceDescriptors) {
    const result = await fetchMedia(url);
    if (!result) return false;

    const blob = new Blob([result.buffer], { type: result.contentType || "font/woff2" });
    const objectUrl = URL.createObjectURL(blob);
    fontObjectUrls.add(objectUrl);

    try {
        const font = new FontFace(family, `url(${objectUrl})`, descriptors);
        await font.load();
        document.fonts.add(font);
        return true;
    } catch {
        URL.revokeObjectURL(objectUrl);
        fontObjectUrls.delete(objectUrl);
        return false;
    }
}

export function loadGoogleFont(fontFamily: string) {
    const family = fontFamily.trim();
    if (!family || loadedFontFamilies.has(family)) return Promise.resolve();

    const loading = loadingFontFamilies.get(family);
    if (loading) return loading;

    const loadPromise = fetchText(createGoogleFontUrl(family))
        .then(css => {
            if (!css) return false;

            const faces = parseFontFaces(css);
            return Promise.all(faces.map(face => loadFontFace(family, face.url, face.descriptors)))
                .then(results => results.some(Boolean));
        })
        .then(loaded => document.fonts.ready.then(() => loaded))
        .then(loaded => {
            if (loaded) loadedFontFamilies.add(family);
        })
        .catch(() => { })
        .finally(() => {
            loadingFontFamilies.delete(family);
        });

    loadingFontFamilies.set(family, loadPromise);
    return loadPromise;
}

export async function addFont(fontData: string | ArrayBuffer, fontFamily: string): Promise<void> {
    let fontSource: string | null = null;
    let shouldRevoke = false;

    try {
        if (typeof fontData === "string") {
            fontSource = fontData;
        } else {
            const blob = new Blob([fontData], { type: "font/otf" });
            fontSource = URL.createObjectURL(blob);
            shouldRevoke = true;
        }

        const font = new FontFace(fontFamily, `url(${fontSource})`);
        await font.load();
        document.fonts.add(font);
        loadedFontFamilies.add(fontFamily);
    } catch {
    } finally {
        if (shouldRevoke && fontSource) URL.revokeObjectURL(fontSource);
    }
}
