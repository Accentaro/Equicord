/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findComponentByCodeLazy } from "@webpack";
import { React } from "@webpack/common";

const logger = new Logger("ChannelGallery", "#8aadf4");

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);
const ANIMATED_EXTS = new Set(["gif", "mp4", "webm", "mov", "m4v"]);

function getExt(name?: string): string {
    if (!name) return "";
    const idx = name.lastIndexOf(".");
    if (idx === -1) return "";
    return name.slice(idx + 1).toLowerCase();
}

function isAnimatedExt(ext: string): boolean {
    return ANIMATED_EXTS.has(ext);
}

function isVideoExt(ext: string): boolean {
    return VIDEO_EXTS.has(ext);
}

/**
 * Normalize URL to a canonical form for deduplication
 * Removes size parameters, CDN variants, and other query params that don't affect the actual media
 */
function extractOriginalUrl(url: string): string {
    if (!url) return url;
    try {
        const u = new URL(url);
        const hostname = u.hostname.toLowerCase();
        
        // Instagram - preserve post ID structure
        if (hostname.includes("instagram.com") || hostname.includes("cdninstagram.com")) {
            const match = url.match(/\/p\/([^/]+)/);
            if (match) {
                // Keep only the post ID, remove size variants
                return `https://${u.hostname}/p/${match[1]}/`;
            }
            return url;
        }
        
        // Tenor - normalize to base URL
        if (hostname.includes("tenor.com") || hostname.includes("media.tenor.com")) {
            // Remove all query parameters
            u.search = "";
            return u.toString();
        }
        
        // Discord CDN - normalize by removing size/format params
        if (hostname.includes("discordapp.net") || hostname.includes("discordapp.com") || hostname.includes("discordusercontent.com")) {
            // Remove size and format parameters but keep the file path
            u.searchParams.delete("width");
            u.searchParams.delete("height");
            u.searchParams.delete("size");
            u.searchParams.delete("format");
            // Keep ex parameter (expiration) as it might affect availability
            return u.toString();
        }
        
        // Generic normalization - remove common size/format parameters
        u.searchParams.delete("width");
        u.searchParams.delete("height");
        u.searchParams.delete("size");
        u.searchParams.delete("format");
        u.searchParams.delete("w");
        u.searchParams.delete("h");
        u.searchParams.delete("resize");
        u.searchParams.delete("quality");
        
        return u.toString();
    } catch {
        return url;
    }
}

/**
 * Generate a normalized URL key for deduplication
 * This is more aggressive than extractOriginalUrl - it focuses on the actual media content
 */
function normalizeUrlForDedup(url: string): string {
    if (!url) return url;
    const normalized = extractOriginalUrl(url);
    
    // For Discord CDN, also normalize the path to remove size variants in the filename
    try {
        const u = new URL(normalized);
        if (u.hostname.includes("discordapp.net") || u.hostname.includes("discordapp.com") || u.hostname.includes("discordusercontent.com")) {
            // Discord CDN URLs often have size in the path like /attachments/.../image.png?size=1024
            // We want to match the same image regardless of size parameter
            const pathParts = u.pathname.split("/");
            // Keep the path structure but normalize
            return `${u.protocol}//${u.hostname}${u.pathname}`;
        }
    } catch {
        // If URL parsing fails, return normalized
    }
    
    return normalized;
}

function isTenorStatic(url: string, contentType?: string): boolean {
    if (!url) return false;
    const ext = getExt(url.split("?")[0]);
    // Tenor static images are usually PNGs
    if (ext === "png" && (url.includes("tenor.com") || url.includes("media.tenor.com"))) {
        // Check content type if available
        if (contentType && contentType.includes("image/png")) {
            return true;
        }
    }
    return false;
}

/**
 * Extract a base ID from Tenor URLs to match static and animated versions
 * Example: https://media.tenor.com/uWGaWe1NAmkAAAAe/shoot-air.png
 *          https://media.tenor.com/uWGaWe1NAmkAAAPo/shoot-air.mp4
 * Returns: "uWGaWe1NAmk/shoot-air" or null if not a Tenor URL
 */
function extractTenorBaseId(url: string): string | null {
    if (!url || (!url.includes("tenor.com") && !url.includes("media.tenor.com"))) {
        return null;
    }
    try {
        // Match pattern: media.tenor.com/{id}/{filename}.{ext}
        const match = url.match(/media\.tenor\.com\/([^/]+)\/([^/?#]+)\./);
        if (match && match[1] && match[2]) {
            // Extract just the base ID part (before the variant suffix like AAAAe or AAAPo)
            const idPart = match[1].replace(/[A-Za-z0-9]{5}$/, ""); // Remove last 5 chars (variant)
            const filename = match[2];
            return `${idPart}/${filename}`;
        }
    } catch {
        // Invalid URL, ignore
    }
    return null;
}

function isSpoiler(attachment: any): boolean {
    if (!attachment) return false;
    const filename = attachment.filename ? String(attachment.filename) : "";
    return Boolean(attachment.spoiler) || filename.startsWith("SPOILER_");
}

function isAllowedImageFilename(name: string | undefined, includeGifs: boolean): boolean {
    if (!name) return false;
    const ext = getExt(name);
    if (!ext) return false;
    if (!includeGifs && ext === "gif") return false;
    return IMAGE_EXTS.has(ext);
}

function isImageAttachment(att: any, includeGifs: boolean): boolean {
    if (!att || !att.url) return false;
    if (isSpoiler(att)) return false;

    const ct = att.content_type ? String(att.content_type) : "";
    const contentType = ct.toLowerCase();
    if (contentType.startsWith("image/")) {
        if (!includeGifs && contentType === "image/gif") return false;
        return true;
    }

    return isAllowedImageFilename(att.filename, includeGifs);
}

function isVideoAttachment(att: any): boolean {
    if (!att || !att.url) return false;
    if (isSpoiler(att)) return false;

    const ct = att.content_type ? String(att.content_type) : "";
    const contentType = ct.toLowerCase();
    if (contentType.startsWith("video/")) return true;

    const ext = getExt(att.filename);
    return ext ? isVideoExt(ext) : false;
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
    authorUsername?: string;
    authorGlobalName?: string;
    timestamp?: string;
    isAnimated?: boolean;
    isVideo?: boolean;
    isEmbed?: boolean;
    embedUrl?: string; // For YouTube/Vimeo embeds
    contentType?: string;
};

export function extractImages(
    messages: any[],
    channelId: string,
    opts: { includeGifs: boolean; includeEmbeds: boolean; }
): GalleryItem[] {
    if (!messages || !Array.isArray(messages)) return [];

    logger.debug("[data] Extracting images from messages", { count: messages.length, channelId, includeEmbeds: opts.includeEmbeds });

    const items: GalleryItem[] = [];
    // Track Tenor base IDs to deduplicate static vs animated versions
    // Maps messageId -> Set of Tenor base IDs that have animated versions
    const tenorAnimatedByMessage = new Map<string, Set<string>>();
    
    // Track normalized URLs across all messages to prevent duplicates
    // Maps normalizedUrl -> GalleryItem (keeps the first occurrence)
    const seenUrls = new Map<string, GalleryItem>();
    
    // Also track proxy URLs for better deduplication (embeds often use proxy URLs)
    const seenProxyUrls = new Map<string, GalleryItem>();
    
    /**
     * Check if a URL (or its proxy) has been seen before
     * Returns the existing item if found, null otherwise
     */
    const findDuplicate = (url: string, proxyUrl?: string): GalleryItem | null => {
        const normalizedUrl = normalizeUrlForDedup(url);
        const existing = seenUrls.get(normalizedUrl);
        if (existing) return existing;
        
        // Also check proxy URL if provided
        if (proxyUrl) {
            const normalizedProxy = normalizeUrlForDedup(proxyUrl);
            const existingProxy = seenProxyUrls.get(normalizedProxy);
            if (existingProxy) return existingProxy;
            
            // Also check if proxy matches any main URL
            for (const [seenUrl, item] of seenUrls.entries()) {
                if (item.proxyUrl) {
                    const seenProxyNormalized = normalizeUrlForDedup(item.proxyUrl);
                    if (seenProxyNormalized === normalizedProxy) {
                        return item;
                    }
                }
            }
        }
        
        return null;
    };
    
    /**
     * Register a URL and its proxy for deduplication tracking
     */
    const registerUrl = (item: GalleryItem, url: string, proxyUrl?: string): void => {
        const normalizedUrl = normalizeUrlForDedup(url);
        seenUrls.set(normalizedUrl, item);
        
        if (proxyUrl) {
            const normalizedProxy = normalizeUrlForDedup(proxyUrl);
            seenProxyUrls.set(normalizedProxy, item);
        }
    };

    for (const m of messages) {
        if (!m) continue;
        const messageId = m.id ? String(m.id) : "";
        if (!messageId) continue;

        const authorId = m.author && m.author.id ? String(m.author.id) : undefined;
        const authorUsername = m.author && m.author.username ? String(m.author.username) : undefined;
        const authorGlobalName = m.author && (m.author.global_name || (m.author as any).globalName) ?
            String(m.author.global_name ?? (m.author as any).globalName) : undefined;
        const timestamp = m.timestamp ? String(m.timestamp) : undefined;
        const base = {
            channelId,
            messageId,
            authorId,
            authorUsername,
            authorGlobalName,
            timestamp
        };

        // Extract from attachments
        const { attachments } = m;
        if (Array.isArray(attachments)) {
            // First pass: collect all Tenor animated items
            const tenorAnimatedIds = new Set<string>();
            for (const a of attachments) {
                const url = String(a.url ?? "");
                if (!url) continue;
                const isVideo = isVideoAttachment(a);
                const ext = getExt(a.filename || url);
                const isAnimated = Boolean(
                    (ext && isAnimatedExt(ext)) ||
                    (a.content_type && (a.content_type.toLowerCase() === "image/gif" || a.content_type.toLowerCase().startsWith("video/")))
                );

                if (isVideo || isAnimated) {
                    const tenorBaseId = extractTenorBaseId(url);
                    if (tenorBaseId) {
                        tenorAnimatedIds.add(tenorBaseId);
                    }
                }
            }

            // Add to message-level tracking
            if (tenorAnimatedIds.size > 0) {
                if (!tenorAnimatedByMessage.has(messageId)) {
                    tenorAnimatedByMessage.set(messageId, new Set());
                }
                for (const id of tenorAnimatedIds) {
                    tenorAnimatedByMessage.get(messageId)!.add(id);
                }
            }

            // Second pass: process attachments, skipping static Tenor images if animated exists
            for (const a of attachments) {
                const url = String(a.url ?? "");
                if (!url) continue;

                const contentType = a.content_type ? String(a.content_type) : undefined;
                const filename = a.filename ? String(a.filename) : undefined;
                const ext = getExt(filename || url);
                const isVideo = isVideoAttachment(a);
                const isImage = isImageAttachment(a, opts.includeGifs);

                if (!isImage && !isVideo) continue;

                // Skip static Tenor images if we have an animated version
                const tenorBaseId = extractTenorBaseId(url);
                if (tenorBaseId && !isVideo) {
                    const animatedIds = tenorAnimatedByMessage.get(messageId);
                    if (animatedIds && animatedIds.has(tenorBaseId) && !isAnimatedExt(ext)) {
                        // We have an animated version, skip this static image
                        continue;
                    }
                }

                const proxyUrl = a.proxy_url ? String(a.proxy_url) : undefined;
                const width = typeof a.width === "number" ? a.width : undefined;
                const height = typeof a.height === "number" ? a.height : undefined;

                const animated = Boolean(
                    (ext && isAnimatedExt(ext)) ||
                    (contentType && (contentType.toLowerCase() === "image/gif" || contentType.toLowerCase().startsWith("video/")))
                );

                // Extract original URL
                const originalUrl = extractOriginalUrl(url);
                const normalizedProxyUrl = proxyUrl ? extractOriginalUrl(proxyUrl) : undefined;
                
                // Check if we've already seen this URL (cross-message deduplication)
                const existingItem = findDuplicate(originalUrl, normalizedProxyUrl);
                if (existingItem) {
                    // Prefer the item with better metadata (has dimensions, filename, etc.)
                    const hasBetterMetadata = (width && height) || filename;
                    const existingHasMetadata = existingItem.width && existingItem.height || existingItem.filename;
                    
                    // Skip if existing item has better metadata, or if this is a duplicate within the same message
                    if (existingHasMetadata && !hasBetterMetadata) {
                        continue;
                    }
                    
                    // If this item has better metadata, replace the existing one
                    if (hasBetterMetadata && !existingHasMetadata) {
                        const existingIndex = items.findIndex(item => item.stableId === existingItem.stableId);
                        if (existingIndex >= 0) {
                            items.splice(existingIndex, 1);
                        }
                    } else {
                        // Both have similar metadata or this is a duplicate, skip
                        continue;
                    }
                }

                const newItem: GalleryItem = {
                    ...base,
                    stableId: `${messageId}:${originalUrl}`,
                    url: originalUrl,
                    proxyUrl: normalizedProxyUrl,
                    filename,
                    width,
                    height,
                    isAnimated: animated,
                    isVideo: isVideo,
                    contentType
                };
                
                items.push(newItem);
                registerUrl(newItem, originalUrl, normalizedProxyUrl);
            }
        }

        // Extract from embeds
        if (opts.includeEmbeds) {
            let { embeds } = m;
            if (typeof embeds === "string") {
                try {
                    embeds = JSON.parse(embeds);
                } catch {
                    logger.debug("[data] Failed to parse embeds JSON", { messageId, embeds: embeds });
                    continue;
                }
            }
            if (Array.isArray(embeds)) {
                for (const e of embeds) {
                    if (!e) continue;
                    let embed = e;
                    if (typeof embed === "string") {
                        try {
                            embed = JSON.parse(embed);
                        } catch {
                            continue;
                        }
                    }

                    // Check for video embeds (YouTube, Vimeo, etc.)
                    const embedUrl = embed.url ? String(embed.url) : undefined;
                    const isVideoEmbed = embedUrl && (
                        embedUrl.includes("youtube.com") ||
                        embedUrl.includes("youtu.be") ||
                        embedUrl.includes("vimeo.com") ||
                        embedUrl.includes("twitch.tv")
                    );

                    if (isVideoEmbed) {
                        if (embedUrl && (embedUrl.includes("/clip/") || embedUrl.includes("youtube.com/clip"))) {
                            continue;
                        }
                        const thumb = embed?.thumbnail;
                        if (thumb?.url) {
                            const thumbUrl = String(thumb.url);
                            if (thumbUrl.includes("/clip/") || thumbUrl.includes("youtube.com/clip")) {
                                continue;
                            }
                        const normalizedProxyUrl = thumb.proxyURL ? String(thumb.proxyURL) : (thumb.proxy_url ? String(thumb.proxy_url) : undefined);
                        
                        // Check for duplicates (same embed URL or thumbnail in different messages)
                        const existingItem = findDuplicate(embedUrl, normalizedProxyUrl);
                        if (existingItem) {
                            continue;
                        }
                        
                        const newItem: GalleryItem = {
                            ...base,
                            stableId: `${messageId}:${embedUrl}`,
                            url: embedUrl,
                            proxyUrl: normalizedProxyUrl,
                            width: typeof thumb.width === "number" ? thumb.width : undefined,
                            height: typeof thumb.height === "number" ? thumb.height : undefined,
                            filename: undefined,
                            isAnimated: true,
                            isVideo: true,
                            isEmbed: true,
                            embedUrl: embedUrl
                        };
                        
                        items.push(newItem);
                        registerUrl(newItem, embedUrl, normalizedProxyUrl);
                        }
                        continue;
                    }

                    // Handle video in embed
                    const { video } = embed;
                    if (video && video.url) {
                        const videoUrl = String(video.url);
                        const proxyUrl = video.proxyURL ? String(video.proxyURL) : (video.proxy_url ? String(video.proxy_url) : undefined);
                        const ext = getExt(videoUrl);
                        const isTenorStaticPng = isTenorStatic(videoUrl, video.content_type);

                        if (isTenorStaticPng) continue;

                        // Track Tenor animated videos
                        const tenorBaseId = extractTenorBaseId(videoUrl);
                        if (tenorBaseId) {
                            if (!tenorAnimatedByMessage.has(messageId)) {
                                tenorAnimatedByMessage.set(messageId, new Set());
                            }
                            tenorAnimatedByMessage.get(messageId)!.add(tenorBaseId);
                        }

                        const originalVideoUrl = extractOriginalUrl(videoUrl);
                        const normalizedProxyUrl = proxyUrl ? extractOriginalUrl(proxyUrl) : undefined;
                        
                        // Check for duplicates
                        const existingItem = findDuplicate(originalVideoUrl, normalizedProxyUrl);
                        if (existingItem) {
                            continue;
                        }
                        
                        const newItem: GalleryItem = {
                            ...base,
                            stableId: `${messageId}:${originalVideoUrl}`,
                            url: originalVideoUrl,
                            proxyUrl: normalizedProxyUrl,
                            width: typeof video.width === "number" ? video.width : undefined,
                            height: typeof video.height === "number" ? video.height : undefined,
                            filename: undefined,
                            isAnimated: true,
                            isVideo: true,
                            contentType: video.content_type ? String(video.content_type) : undefined
                        };
                        
                        items.push(newItem);
                        registerUrl(newItem, originalVideoUrl, normalizedProxyUrl);
                    }

                    // Handle images and thumbnails
                    const { image } = embed;
                    const thumb = embed.thumbnail;

                    for (const source of [image, thumb]) {
                        if (!source || !source.url) continue;
                        const url = String(source.url);

                        if (isTenorStatic(url, source.content_type)) continue;

                        // Skip static Tenor images if we already have an animated version
                        const tenorBaseId = extractTenorBaseId(url);
                        if (tenorBaseId) {
                            const animatedIds = tenorAnimatedByMessage.get(messageId);
                            if (animatedIds && animatedIds.has(tenorBaseId)) {
                                // We already have an animated version, skip this static image
                                continue;
                            }
                        }

                        if (!isImageUrl(url, opts.includeGifs)) continue;

                        const ext = getExt(url);
                        let animated = false;
                        if (ext && isAnimatedExt(ext)) {
                            animated = true;
                        } else if (source.content_type) {
                            const ct = String(source.content_type).toLowerCase();
                            if (ct === "image/gif" || ct.startsWith("video/")) {
                                animated = true;
                            }
                        }
                        if (ext && !isAnimatedExt(ext) && !isVideoExt(ext)) {
                            animated = false;
                        }

                        const originalUrl = extractOriginalUrl(url);
                        const normalizedProxyUrl = source.proxyURL ? extractOriginalUrl(String(source.proxyURL)) : (source.proxy_url ? extractOriginalUrl(String(source.proxy_url)) : undefined);
                        
                        // Check if we've already seen this URL (could be from attachment or previous embed)
                        const existingItem = findDuplicate(originalUrl, normalizedProxyUrl);
                        if (existingItem) {
                            // For embed thumbnails, be more aggressive: always skip if we have an attachment
                            // (attachments have filenames and are generally better quality)
                            if (existingItem.filename) {
                                // Existing item is an attachment, skip this embed thumbnail
                                continue;
                            }
                            
                            // Skip embed thumbnails that duplicate other embeds unless this has better dimensions
                            const hasBetterMetadata = typeof source.width === "number" && typeof source.height === "number";
                            const existingHasMetadata = existingItem.width && existingItem.height;
                            
                            if (!hasBetterMetadata || existingHasMetadata) {
                                continue;
                            }
                            
                            // Replace if this embed has better metadata
                            const existingIndex = items.findIndex(item => item.stableId === existingItem.stableId);
                            if (existingIndex >= 0) {
                                items.splice(existingIndex, 1);
                            }
                        }

                        const newItem: GalleryItem = {
                            ...base,
                            stableId: `${messageId}:${originalUrl}`,
                            url: originalUrl,
                            proxyUrl: normalizedProxyUrl,
                            width: typeof source.width === "number" ? source.width : undefined,
                            height: typeof source.height === "number" ? source.height : undefined,
                            filename: undefined,
                            isAnimated: animated,
                            contentType: source.content_type ? String(source.content_type) : undefined
                        };
                        
                        items.push(newItem);
                        registerUrl(newItem, originalUrl, normalizedProxyUrl);
                    }
                }
            }
        }

        // Final deduplication pass for this message: prefer animated Tenor versions
        // This handles cases where static and animated versions might be in different parts
        const messageItems = items.filter(item => item.messageId === messageId);
        const tenorItemsByBaseId = new Map<string, GalleryItem[]>();

        for (const item of messageItems) {
            const tenorBaseId = extractTenorBaseId(item.url);
            if (tenorBaseId) {
                if (!tenorItemsByBaseId.has(tenorBaseId)) {
                    tenorItemsByBaseId.set(tenorBaseId, []);
                }
                tenorItemsByBaseId.get(tenorBaseId)!.push(item);
            }
        }

        // Collect static items to remove (when animated version exists)
        const staticItemsToRemove = new Set<string>();
        for (const [baseId, baseItems] of tenorItemsByBaseId) {
            if (baseItems.length <= 1) continue;

            const hasAnimated = baseItems.some(item => item.isAnimated || item.isVideo);
            if (hasAnimated) {
                // Mark static items for removal (keep only animated/video ones)
                const staticItems = baseItems.filter(item => !item.isAnimated && !item.isVideo);
                for (const staticItem of staticItems) {
                    staticItemsToRemove.add(staticItem.stableId);
                }
            }
        }

        // Remove static items
        if (staticItemsToRemove.size > 0) {
            for (let i = items.length - 1; i >= 0; i--) {
                if (staticItemsToRemove.has(items[i].stableId)) {
                    items.splice(i, 1);
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
