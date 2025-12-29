/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import { React } from "@webpack/common";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif"]);

function getExt(name?: string): string {
    if (!name) return "";
    const idx = name.lastIndexOf(".");
    if (idx === -1) return "";
    return name.slice(idx + 1).toLowerCase();
}

function isSpoiler(attachment: any): boolean {
    if (!attachment) return false;
    const filename = String(attachment?.filename ?? "");
    return Boolean(attachment?.spoiler) || filename.startsWith("SPOILER_");
}

function isAllowedImageFilename(name: string | undefined, includeGifs: boolean): boolean {
    if (!name) return false;
    const ext = getExt(name);
    if (!ext) return false;
    if (!includeGifs && ext === "gif") return false;
    return IMAGE_EXTS.has(ext);
}

function isImageAttachment(att: any, includeGifs: boolean): boolean {
    if (!att?.url) return false;
    if (isSpoiler(att)) return false;

    const ct = String(att?.content_type ?? "").toLowerCase();
    if (ct.startsWith("image/")) {
        if (!includeGifs && ct === "image/gif") return false;
        return true;
    }

    return isAllowedImageFilename(att?.filename, includeGifs);
}

function isImageUrl(url: string, includeGifs: boolean): boolean {
    if (!url || !/^https?:\/\//i.test(url)) return false;
    const ext = getExt(url.split("?")[0]);
    if (!ext) return false;
    if (!includeGifs && ext === "gif") return false;
    return IMAGE_EXTS.has(ext);
}

export type GalleryItem = {
    stableId: string; // messageId:url format for stable selection
    channelId: string;
    messageId: string;
    url: string;
    proxyUrl?: string;
    width?: number;
    height?: number;
    filename?: string;
    authorId?: string;
    timestamp?: string;
};

export function extractImages(
    messages: any[],
    channelId: string,
    opts: { includeGifs: boolean; includeEmbeds: boolean; }
): GalleryItem[] {
    if (!messages || !Array.isArray(messages)) return [];

    const items: GalleryItem[] = [];

    for (const m of messages) {
        if (!m) continue;
        const messageId = String(m?.id ?? "");
        if (!messageId) continue;

        const base = {
            channelId,
            messageId,
            authorId: m?.author?.id ? String(m.author.id) : undefined,
            timestamp: m?.timestamp ? String(m.timestamp) : undefined
        };

        // Extract from attachments
        const attachments = m?.attachments;
        if (Array.isArray(attachments)) {
            for (const a of attachments) {
                if (!isImageAttachment(a, opts.includeGifs)) continue;
                const url = String(a.url ?? "");
                if (!url) continue;

                const proxyUrl = a.proxy_url ? String(a.proxy_url) : undefined;
                const filename = a.filename ? String(a.filename) : undefined;
                const width = typeof a.width === "number" ? a.width : undefined;
                const height = typeof a.height === "number" ? a.height : undefined;

                items.push({
                    ...base,
                    stableId: `${messageId}:${url}`,
                    url,
                    proxyUrl,
                    filename,
                    width,
                    height
                });
            }
        }

        // Extract from embeds
        if (opts.includeEmbeds) {
            const embeds = m?.embeds;
            if (Array.isArray(embeds)) {
                for (const e of embeds) {
                    if (!e) continue;
                    const image = e?.image;
                    const thumb = e?.thumbnail;

                    for (const source of [image, thumb]) {
                        if (!source?.url) continue;
                        const url = String(source.url);
                        if (!isImageUrl(url, opts.includeGifs)) continue;

                        items.push({
                            ...base,
                            stableId: `${messageId}:${url}`,
                            url,
                            proxyUrl: source.proxyURL ? String(source.proxyURL) : (source.proxy_url ? String(source.proxy_url) : undefined),
                            width: typeof source.width === "number" ? source.width : undefined,
                            height: typeof source.height === "number" ? source.height : undefined,
                            filename: undefined
                        });
                    }
                }
            }
        }
    }

    return items;
}

// Icon finder - try to find Discord's native gallery icon by code pattern
function findGalleryIcon(): React.ComponentType<any> | null {
    try {
        // Try to find the icon component by its unique code pattern
        // Looking for the specific SVG paths from Discord's gallery icon
        const byCode = findComponentByCodeLazy("M4 8v7.5a.5.5 0 0 1-.5.5H3a1 1 0 0 1-1-1V8a6 6 0 0 1 6-6h7a1 1 0 0 1 1 1v.5a.5.5 0 0 1-.5.5H8a4 4 0 0 0-4 4Z");
        if (byCode) return byCode;
    } catch {
        // Module not found, fall through to fallback
    }
    return null;
}

// Fallback SVG icon component - matches Discord's gallery icon design
function FallbackGalleryIcon(props: React.SVGProps<SVGSVGElement>) {
    const { width = 20, height = 20, ...restProps } = props;
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
            {...restProps}
        >
            <path
                fill="currentColor"
                d="M4 8v7.5a.5.5 0 0 1-.5.5H3a1 1 0 0 1-1-1V8a6 6 0 0 1 6-6h7a1 1 0 0 1 1 1v.5a.5.5 0 0 1-.5.5H8a4 4 0 0 0-4 4Z"
            />
            <path
                fill="currentColor"
                fillRule="evenodd"
                d="M6 9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9Zm13.8 9.79L16.82 15a2 2 0 0 0-3.14 0l-2.09 2.65-.13-.16a1.5 1.5 0 0 0-2.36.05l-.95 1.26a.75.75 0 0 0 .6 1.2h10.46c.62 0 .97-.72.59-1.21ZM11.73 8.3c.57-.56 1.52-.01 1.33.77a.8.8 0 0 0 .55.96c.77.22.77 1.3 0 1.53a.8.8 0 0 0-.55.96c.19.77-.76 1.32-1.33.76a.8.8 0 0 0-1.1 0c-.58.56-1.53.01-1.33-.76a.8.8 0 0 0-.56-.96c-.77-.22-.77-1.31 0-1.53a.8.8 0 0 0 .56-.96c-.2-.78.75-1.33 1.32-.77.31.3.8.3 1.11 0Z"
                clipRule="evenodd"
            />
        </svg>
    );
}

// Export the icon component with fallback
const NativeIcon = findGalleryIcon();
export const GalleryIcon = NativeIcon || FallbackGalleryIcon;
