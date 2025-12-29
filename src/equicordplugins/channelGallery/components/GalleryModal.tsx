/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import { MediaModalItem, ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openMediaModal } from "@utils/modal";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, React, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { extractImages, GalleryItem } from "../utils/extractImages";
import { fetchMessagesChunk } from "../utils/pagination";
import { GalleryGrid } from "./GalleryGrid";
import { LightboxViewer } from "./LightboxViewer";

const jumper: any = findByPropsLazy("jumpToMessage");

type PluginSettings = {
    includeGifs: boolean;
    includeEmbeds: boolean;
    showCaptions: boolean;
    chunkSize: number;
    preloadChunks: number;
};

type GalleryCache = {
    items: GalleryItem[];
    keys: Set<string>;
    oldestMessageId: string | null;
    hasMore: boolean;
};

export const cacheByChannel = new Map<string, GalleryCache>();

function getOrCreateCache(channelId: string): GalleryCache {
    const existing = cacheByChannel.get(channelId);
    if (existing) return existing;
    const created: GalleryCache = {
        items: [],
        keys: new Set(),
        oldestMessageId: null,
        hasMore: true
    };
    cacheByChannel.set(channelId, created);
    return created;
}

export function GalleryModal(props: ModalProps & { channelId: string; settings: PluginSettings; }) {
    const { channelId, settings, ...modalProps } = props;

    const channel = ChannelStore.getChannel(channelId);
    const title = channel?.name ? `Gallery — #${channel.name}` : "Gallery";

    const cache = useMemo(() => getOrCreateCache(channelId), [channelId]);

    const [items, setItems] = useState<GalleryItem[]>(() => cache.items);
    const [hasMore, setHasMore] = useState<boolean>(() => cache.hasMore);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [isFullscreenOpen, setIsFullscreenOpen] = useState<boolean>(false);

    const abortRef = useRef<AbortController | null>(null);
    const loadingRef = useRef<boolean>(false);
    const pendingViewerIndexRef = useRef<number | null>(null);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const loadNextChunks = useCallback(async (chunks: number) => {
        // Use ref to prevent race conditions
        if (loadingRef.current) return;
        if (!hasMore) return;

        loadingRef.current = true;
        setLoading(true);
        setError(null);

        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;

        try {
            let before = cache.oldestMessageId;
            let localHasMore = cache.hasMore;
            let loadedAny = false;

            for (let i = 0; i < chunks && localHasMore; i++) {
                const msgs = await fetchMessagesChunk({
                    channelId,
                    before,
                    limit: Math.max(1, Math.floor(settings.chunkSize)),
                    signal: controller.signal
                });

                if (!msgs.length) {
                    localHasMore = false;
                    break;
                }

                before = msgs[msgs.length - 1]?.id ?? before;
                cache.oldestMessageId = before;

                const extracted = extractImages(msgs, channelId, {
                    includeEmbeds: settings.includeEmbeds,
                    includeGifs: settings.includeGifs
                });

                for (const it of extracted) {
                    if (cache.keys.has(it.key)) continue;
                    cache.keys.add(it.key);
                    cache.items.push(it);
                }

                loadedAny = true;
            }

            // Only update state if we successfully loaded at least one chunk
            if (loadedAny || !localHasMore) {
                cache.hasMore = localHasMore;
                setItems([...cache.items]);
                setHasMore(cache.hasMore);
            }
        } catch (e: unknown) {
            // Don't set error for aborted requests
            if (e instanceof Error && (e.name === "AbortError" || e.message === "AbortError")) {
                loadingRef.current = false;
                setLoading(false);
                return;
            }
            console.error("Failed to load gallery items:", e);
            setError("Unable to load gallery items");
            // If we got an error and have no items, mark as no more to prevent infinite retries
            if (cache.items.length === 0) {
                cache.hasMore = false;
                setHasMore(false);
            }
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [channelId, hasMore, settings.chunkSize, settings.includeEmbeds, settings.includeGifs, cache]);

    // Initial load/preload (lazy, only after modal opens).
    useEffect(() => {
        if (items.length > 0) return;
        if (loadingRef.current) return;
        void loadNextChunks(Math.max(1, Math.floor(settings.preloadChunks)));
    }, [channelId, items.length, settings.preloadChunks, loadNextChunks]);

    // Restore viewer when fullscreen closes
    useEffect(() => {
        if (!isFullscreenOpen && pendingViewerIndexRef.current !== null) {
            const indexToRestore = pendingViewerIndexRef.current;
            pendingViewerIndexRef.current = null;

            // Always use cache.items as source of truth
            const latestItems = cache.items;
            const restoredIndex = Math.max(0, Math.min(indexToRestore, latestItems.length - 1));

            // Update items state to match cache, then restore viewer
            setItems([...latestItems]);

            // Restore viewer index after items update
            requestAnimationFrame(() => {
                setViewerIndex(restoredIndex);
            });
        }
    }, [isFullscreenOpen, cache]);

    const onCloseAll = () => {
        abortRef.current?.abort();
        modalProps.onClose();
    };

    const viewerItem = viewerIndex != null && items && items.length > 0 && viewerIndex < items.length
        ? items[viewerIndex]
        : null;

    const handleOpenMessage = () => {
        // Early return if no viewer item
        if (!viewerItem || !viewerItem.messageId)
            return;

        try {
            jumper.jumpToMessage({
                channelId,
                messageId: viewerItem.messageId,
                flash: true,
                jumpType: "INSTANT"
            });
        } finally {
            onCloseAll();
        }
    };

    const downloadRef = React.useRef<HTMLAnchorElement | null>(null);

    const handleDownload = async () => {
        if (!viewerItem?.url || !downloadRef.current) return;

        try {
            const response = await fetch(viewerItem.url);
            if (!response.ok) throw new Error("Failed to fetch image");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            downloadRef.current.href = url;
            downloadRef.current.download = viewerItem.filename || "image";
            downloadRef.current.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to download image:", error);
            // Fallback: try direct download
            downloadRef.current.href = viewerItem.url;
            downloadRef.current.download = viewerItem.filename || "image";
            downloadRef.current.target = "_blank";
            downloadRef.current.click();
        }
    };

    const handleFullscreen = async () => {
        // Early return if invalid state
        if (viewerIndex == null || !items || items.length === 0)
            return;

        // Load all available images before opening native carousel
        // Since native carousel can't dynamically load more, we need to preload everything
        if (hasMore && !loadingRef.current) {
            setLoading(true);
            try {
                // Load in batches until we have everything
                let previousItemCount = items.length;
                let iterations = 0;
                const maxIterations = 20; // Safety limit

                while (cache.hasMore && !loadingRef.current && iterations < maxIterations) {
                    await loadNextChunks(3); // Load 3 chunks at a time
                    iterations++;

                    // Wait a bit for state to update
                    await new Promise(resolve => setTimeout(resolve, 50));

                    // Check if we got more items
                    const currentItemCount = cache.items.length;
                    if (currentItemCount === previousItemCount || !cache.hasMore) {
                        break;
                    }
                    previousItemCount = currentItemCount;
                }

                // Update items state with all loaded items
                setItems([...cache.items]);
                setHasMore(cache.hasMore);
            } finally {
                setLoading(false);
            }
        }

        // Use the latest items from cache
        const allItems = cache.items.length > items.length ? cache.items : items;

        // Early return if no items available
        if (!allItems || allItems.length === 0)
            return;

        // Convert gallery items to Discord's MediaModalItem format
        const mediaItems: MediaModalItem[] = allItems.map(item => ({
            type: "IMAGE" as const,
            url: item.proxyUrl || item.url,
            original: item.url,
            alt: item.filename || "Image",
            width: item.width,
            height: item.height,
            animated: item.filename?.toLowerCase().endsWith(".gif") || item.url.toLowerCase().includes(".gif")
        }));

        // Store the current viewer index to restore when fullscreen closes
        // We know viewerIndex is not null from the early return check above
        const currentIndex = viewerIndex;

        // Validate starting index is within bounds
        const validStartingIndex = Math.max(0, Math.min(currentIndex, mediaItems.length - 1));

        // Mark fullscreen as open and close lightbox
        setIsFullscreenOpen(true);
        setViewerIndex(null);

        // Open fullscreen modal
        openMediaModal({
            items: mediaItems,
            startingIndex: validStartingIndex,
            location: "Channel Gallery",
            onCloseCallback: () => {
                // Store the index to restore and clear fullscreen flag
                // The useEffect will handle the actual restoration
                pendingViewerIndexRef.current = currentIndex;
                setIsFullscreenOpen(false);
            }
        });
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE} aria-label="Gallery">
            {/* Hidden anchor for downloads - part of React tree, not DOM manipulation */}
            <a ref={downloadRef} style={{ display: "none" }} />
            <ModalHeader>
                <Heading tag="h3" className="vc-gallery-modal-title">
                    {title}
                </Heading>
                {viewerItem && (
                    <>
                        <button
                            onClick={handleOpenMessage}
                            className="vc-gallery-button"
                        >
                            Open message
                        </button>
                        <button
                            onClick={handleDownload}
                            className="vc-gallery-icon-button"
                            aria-label="Download image"
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                className="vc-gallery-icon"
                            >
                                <path
                                    d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z"
                                    fill="currentColor"
                                />
                            </svg>
                        </button>
                        <button
                            onClick={handleFullscreen}
                            className="vc-gallery-icon-button"
                            aria-label="View fullscreen"
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                className="vc-gallery-icon"
                            >
                                <path
                                    d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
                                    fill="currentColor"
                                />
                            </svg>
                        </button>
                    </>
                )}
                <ModalCloseButton onClick={onCloseAll} />
            </ModalHeader>
            <ModalContent
                className="vc-channel-gallery-modal"
            >
                {viewerItem ? (
                    <LightboxViewer
                        items={items}
                        index={viewerIndex!}
                        onClose={() => setViewerIndex(null)}
                        onChangeIndex={setViewerIndex}
                        onOpenMessage={onCloseAll}
                        channelId={channelId}
                    />
                ) : !isFullscreenOpen ? (
                    <GalleryGrid
                        key={channelId}
                        items={items}
                        showCaptions={settings.showCaptions}
                        isLoading={loading}
                        hasMore={hasMore}
                        error={error}
                        onRetry={loadNextChunks.bind(null, 1)}
                        onLoadMore={loadNextChunks.bind(null, 1)}
                        onSelect={setViewerIndex}
                    />
                ) : null}
            </ModalContent>
        </ModalRoot>
    );
}
