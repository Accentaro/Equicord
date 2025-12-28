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

const cacheByChannel = new Map<string, GalleryCache>();

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

    const abortRef = useRef<AbortController | null>(null);
    const loadingRef = useRef<boolean>(false);

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

    const onCloseAll = () => {
        abortRef.current?.abort();
        modalProps.onClose();
    };

    const viewerItem = viewerIndex != null ? items[viewerIndex] : null;

    const handleOpenMessage = () => {
        if (viewerItem) {
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
        }
    };

    const handleDownload = async () => {
        if (viewerItem?.url) {
            try {
                const response = await fetch(viewerItem.url);
                if (!response.ok) throw new Error("Failed to fetch image");

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = viewerItem.filename || "image";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error("Failed to download image:", error);
                // Fallback: try direct download
                const link = document.createElement("a");
                link.href = viewerItem.url;
                link.download = viewerItem.filename || "image";
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    };

    const handleFullscreen = () => {
        if (viewerIndex == null || items.length === 0) return;

        // Convert gallery items to Discord's MediaModalItem format
        const mediaItems: MediaModalItem[] = items.map(item => ({
            type: "IMAGE" as const,
            url: item.proxyUrl || item.url,
            original: item.url,
            alt: item.filename || "Image",
            width: item.width,
            height: item.height,
            animated: item.filename?.toLowerCase().endsWith(".gif") || item.url.toLowerCase().includes(".gif")
        }));

        // Open Discord's built-in media viewer with all gallery images
        openMediaModal({
            items: mediaItems,
            startingIndex: viewerIndex,
            location: "Channel Gallery"
        });
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE} aria-label="Gallery">
            <ModalHeader>
                <Heading tag="h3" style={{ flex: 1, margin: 0 }}>
                    {title}
                </Heading>
                {viewerItem && (
                    <>
                        <button
                            onClick={handleOpenMessage}
                            style={{
                                padding: "8px 16px",
                                borderRadius: "20px",
                                border: "none",
                                background: "var(--background-modifier-hover)",
                                color: "var(--text-default)",
                                cursor: "pointer",
                                fontSize: "14px",
                                fontWeight: 500,
                                transition: "background-color 0.15s ease",
                                marginRight: 8
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = "var(--background-modifier-active)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "var(--background-modifier-hover)";
                            }}
                        >
                            Open message
                        </button>
                        <button
                            onClick={handleDownload}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                border: "none",
                                background: "var(--background-modifier-hover)",
                                color: "var(--interactive-icon-default)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "background-color 0.15s ease, color 0.15s ease",
                                marginRight: 8
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = "var(--background-modifier-active)";
                                e.currentTarget.style.color = "var(--interactive-icon-hover)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "var(--background-modifier-hover)";
                                e.currentTarget.style.color = "var(--interactive-icon-default)";
                            }}
                            aria-label="Download image"
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{ color: "currentColor" }}
                            >
                                <path
                                    d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z"
                                    fill="currentColor"
                                />
                            </svg>
                        </button>
                        <button
                            onClick={handleFullscreen}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                border: "none",
                                background: "var(--background-modifier-hover)",
                                color: "var(--interactive-icon-default)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "background-color 0.15s ease, color 0.15s ease",
                                marginRight: 8
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = "var(--background-modifier-active)";
                                e.currentTarget.style.color = "var(--interactive-icon-hover)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "var(--background-modifier-hover)";
                                e.currentTarget.style.color = "var(--interactive-icon-default)";
                            }}
                            aria-label="View fullscreen"
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{ color: "currentColor" }}
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
                style={{ padding: 0, overflow: "hidden" }}
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
                ) : (
                    <GalleryGrid
                        items={items}
                        showCaptions={settings.showCaptions}
                        isLoading={loading}
                        hasMore={hasMore}
                        error={error}
                        onRetry={loadNextChunks.bind(null, 1)}
                        onLoadMore={loadNextChunks.bind(null, 1)}
                        onSelect={setViewerIndex}
                    />
                )}
            </ModalContent>
        </ModalRoot>
    );
}
