import { Heading } from "@components/Heading";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, React, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { extractImages, GalleryItem } from "../utils/extractImages";
import { fetchMessagesPage } from "../utils/pagination";
import { GalleryGrid } from "./GalleryGrid";
import { LightboxViewer } from "./LightboxViewer";

const jumper: any = findByPropsLazy("jumpToMessage");

type PluginSettings = {
    includeGifs: boolean;
    includeEmbeds: boolean;
    showCaptions: boolean;
    pageSize: number;
    preloadPages: number;
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

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    async function loadNextPages(pages: number) {
        if (loading) return;
        if (!hasMore) return;

        setLoading(true);
        setError(null);

        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;

        try {
            let before = cache.oldestMessageId;
            let localHasMore = cache.hasMore;

            for (let i = 0; i < pages && localHasMore; i++) {
                const msgs = await fetchMessagesPage({
                    channelId,
                    before,
                    limit: Math.max(1, Math.floor(settings.pageSize)),
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
            }

            cache.hasMore = localHasMore;

            setItems([...cache.items]);
            setHasMore(cache.hasMore);
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            setError("Unable to load gallery items");
        } finally {
            setLoading(false);
        }
    }

    // Initial load/preload (lazy, only after modal opens).
    useEffect(() => {
        if (cache.items.length) return;
        void loadNextPages(Math.max(1, Math.floor(settings.preloadPages)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelId]);

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
        if (viewerItem?.url) {
            const img = new Image();
            img.src = viewerItem.url;
            img.style.maxWidth = "100vw";
            img.style.maxHeight = "100vh";
            img.style.objectFit = "contain";
            
            const container = document.createElement("div");
            container.style.position = "fixed";
            container.style.top = "0";
            container.style.left = "0";
            container.style.width = "100vw";
            container.style.height = "100vh";
            container.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
            container.style.display = "flex";
            container.style.alignItems = "center";
            container.style.justifyContent = "center";
            container.style.zIndex = "99999";
            container.style.cursor = "pointer";
            
            container.appendChild(img);
            document.body.appendChild(container);
            
            const closeFullscreen = () => {
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                }
                document.removeEventListener("keydown", keyHandler);
            };
            
            const keyHandler = (e: KeyboardEvent) => {
                if (e.key === "Escape") {
                    closeFullscreen();
                }
            };
            
            container.addEventListener("click", closeFullscreen);
            document.addEventListener("keydown", keyHandler);
        }
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
                        onRetry={() => loadNextPages(1)}
                        onLoadMore={() => loadNextPages(1)}
                        onSelect={setViewerIndex}
                    />
                )}
            </ModalContent>
        </ModalRoot>
    );
}
