/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MediaType } from "./types";

export function checkSameUrl(url1: string, url2: string) {
    return url1 === url2 || url1.split("?")[0] === url2.split("?")[0];
}

export function getUrlName(url: string) {
    try {
        const u = new URL(url);
        const last = u.pathname.split("/").filter(Boolean).pop();
        return decodeURIComponent(last ?? "media");
    } catch {
        return "media";
    }
}

export function getUrlExt(url: string, type?: MediaType) {
    const pathname = (() => {
        try {
            return new URL(url).pathname;
        } catch {
            return url;
        }
    })();

    const ext = pathname.split("/").pop()?.split(".").pop();
    if (!ext) return type ? `.${type}` : "";
    return `.${ext.toLowerCase()}`;
}

export function isLikelyGif(url: string) {
    return url.split("?")[0].toLowerCase().endsWith(".gif");
}

export function isHttpUrl(url: string) {
    return /^https?:\/\//.test(url);
}

