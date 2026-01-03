/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { MediaModalItem, openMediaModal } from "@utils/modal";

import type { GalleryItem } from "../utils/media";

const logger = new Logger("ChannelGallery", "#8aadf4");

// Performance tracking helpers
const perfTimers = new Map<string, number>();
const MAX_PERF_TIMERS = 100;

function perfStart(name: string): void {
    // Clean up old timers if map gets too large
    if (perfTimers.size >= MAX_PERF_TIMERS) {
        const firstKey = perfTimers.keys().next().value;
        if (firstKey) perfTimers.delete(firstKey);
    }
    perfTimers.set(name, performance.now());
}

function perfEnd(name: string): void {
    const start = perfTimers.get(name);
    if (start === undefined) return;
    perfTimers.delete(name);
    const duration = performance.now() - start;
    logger.debug(`[perf] ${name} (${duration.toFixed(2)} ms)`);
}

// Helper to convert GalleryItem to MediaModalItem
function itemToMediaItem(item: GalleryItem): MediaModalItem {
    const isAnimated = item.isAnimated ||
        item.filename?.toLowerCase().endsWith(".gif") ||
        item.url.toLowerCase().includes(".gif") ||
        item.url.toLowerCase().match(/\.(gif|mp4|webm|mov|m4v)(\?|$)/i) !== null;

    // Use original URL for animated media to avoid 415 errors with Discord proxy
    let mediaUrl = item.url;
    if (!isAnimated && item.proxyUrl) {
        try {
            const urlHost = new URL(item.url).hostname.toLowerCase();
            if (urlHost.includes("discord") || urlHost.includes("discordapp")) {
                mediaUrl = item.proxyUrl;
            }
        } catch {
            // Invalid URL, use original
        }
    }

    return {
        type: "IMAGE" as const,
        url: mediaUrl,
        original: item.url,
        alt: item.filename || "Image",
        width: item.width,
        height: item.height,
        animated: isAnimated
    };
}

// Preload images for faster navigation (skip videos)
function preloadAdjacentImages(items: GalleryItem[], index: number, windowSize: number = 3): void {
    const start = Math.max(0, index - windowSize);
    const end = Math.min(items.length, index + windowSize + 1);

    for (let i = start; i < end; i++) {
        const item = items[i];
        if (!item) continue;
        // Skip preloading videos and animated content
        if (item.isVideo || item.isAnimated || item.isEmbed) continue;

        const mediaItem = itemToMediaItem(item);
        const img = new Image();
        img.src = mediaItem.url;
    }
}

let isFullscreenOpen = false;

export function openFullscreenView(
    items: GalleryItem[],
    selectedStableId: string,
    onClose: (newStableId: string | null) => void
): void {
    if (isFullscreenOpen) {
        logger.warn("[lifecycle] Fullscreen view already open, ignoring");
        return;
    }
    if (!items || items.length === 0) {
        logger.warn("[lifecycle] No items for fullscreen view");
        return;
    }

    logger.info("[lifecycle] Opening fullscreen view", { selectedStableId, itemCount: items.length });
    isFullscreenOpen = true;

    const selectedIndex = items.findIndex(item => item && item.stableId === selectedStableId);
    const validIndex = selectedIndex >= 0 ? Math.min(selectedIndex, items.length - 1) : 0;

    // Preload adjacent images
    preloadAdjacentImages(items, validIndex, 2);

    perfStart("fullscreen-build");
    const mediaItems: MediaModalItem[] = items
        .filter((item): item is GalleryItem => Boolean(item))
        .map(itemToMediaItem);
    perfEnd("fullscreen-build");

    if (mediaItems.length === 0) {
        logger.warn("[lifecycle] No media items for fullscreen view");
        isFullscreenOpen = false;
        return;
    }

    let hasCalledOnClose = false;
    let currentIndex = validIndex;

    const handleClose = () => {
        if (hasCalledOnClose) return;
        hasCalledOnClose = true;
        isFullscreenOpen = false;

        // Get the stableId of the currently viewed item
        const currentItem = items[currentIndex];
        const newStableId = currentItem?.stableId ?? null;

        logger.info("[lifecycle] Fullscreen view closed", { newStableId, currentIndex });
        onClose(newStableId);
    };

    // Track index changes via the media modal's navigation
    // The modal internally tracks this, we just use the close callback
    openMediaModal({
        items: mediaItems,
        startingIndex: validIndex,
        location: "Channel Gallery",
        onCloseCallback: handleClose,
        onIndexChange: (index: number) => {
            currentIndex = index;
            logger.debug("[lifecycle] Fullscreen modal index changed", { index });
            // Preload more images in background
            preloadAdjacentImages(items, index, 3);
        }
    });

    // Preload more images in background after initial render
    if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => preloadAdjacentImages(items, validIndex, 5), { timeout: 1000 });
    } else {
        setTimeout(() => preloadAdjacentImages(items, validIndex, 5), 100);
    }
}
