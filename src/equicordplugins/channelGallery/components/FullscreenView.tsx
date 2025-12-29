/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MediaModalItem, openMediaModal } from "@utils/modal";

import type { GalleryItem } from "../utils/media";

export function openFullscreenView(
    items: GalleryItem[],
    selectedStableId: string,
    onClose: () => void
): void {
    console.log("[Gallery] openFullscreenView - Called", { 
        itemsCount: items?.length, 
        selectedStableId 
    });
    
    if (!items || items.length === 0) {
        console.log("[Gallery] openFullscreenView - Early return: no items");
        return;
    }

    // Find selected index
    const selectedIndex = items.findIndex(item => item?.stableId === selectedStableId);
    const validIndex = Math.max(0, Math.min(selectedIndex >= 0 ? selectedIndex : 0, items.length - 1));
    console.log("[Gallery] openFullscreenView - Index calculated", { 
        selectedIndex, 
        validIndex, 
        totalItems: items.length 
    });

    // Convert to Discord's media modal format
    const mediaItems: MediaModalItem[] = items
        .filter((item): item is GalleryItem => item !== null && item !== undefined)
        .map(item => ({
            type: "IMAGE" as const,
            url: item.proxyUrl || item.url,
            original: item.url,
            alt: item.filename || "Image",
            width: item.width,
            height: item.height,
            animated: item.filename?.toLowerCase().endsWith(".gif") || item.url.toLowerCase().includes(".gif")
        }));

    if (mediaItems.length === 0) {
        console.log("[Gallery] openFullscreenView - Early return: no valid media items");
        return;
    }

    console.log("[Gallery] openFullscreenView - Opening media modal", { 
        mediaItemsCount: mediaItems.length, 
        startingIndex: validIndex 
    });
    openMediaModal({
        items: mediaItems,
        startingIndex: validIndex,
        location: "Channel Gallery",
        onCloseCallback: () => {
            console.log("[Gallery] openFullscreenView - Media modal onCloseCallback fired");
            onClose();
        }
    });
    console.log("[Gallery] openFullscreenView - openMediaModal called");
}
