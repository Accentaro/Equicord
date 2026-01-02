/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ChannelToolbarButton } from "@api/HeaderBar";
import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { EquicordDevs } from "@utils/constants";
import { closeModal, ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, PermissionsBits, PermissionStore, React, SelectedChannelStore, UserStore, useStateFromStores } from "@webpack/common";

import { GalleryView } from "./components/GalleryView";
import { SingleView } from "./components/SingleView";
import { log } from "./utils/logging";
import { extractImages, GalleryIcon, GalleryItem } from "./utils/media";
import { fetchMessagesChunk } from "./utils/pagination";

const jumper: any = findByPropsLazy("jumpToMessage");

// ============================================================
// Settings
// ============================================================

export const settings = definePluginSettings({
    includeGifs: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Include GIFs in the gallery",
    },
    includeEmbeds: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Include embed images in the gallery (Some may not render)",
    },
    showCaptions: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Show filename captions on thumbnails",
    },
    chunkSize: {
        type: OptionType.NUMBER,
        default: 100,
        description: "Messages fetched per chunk (25–100, Discord API limit)",
        isValid: v => {
            const num = typeof v === "string" ? Number(v) : v;
            return Number.isFinite(num) && num >= 25 && num <= 100;
        },
    },
    preloadChunks: {
        type: OptionType.NUMBER,
        default: 3,
        description: "Chunks to preload when opening (1–5 recommended)",
        isValid: v => {
            const num = typeof v === "string" ? Number(v) : v;
            return Number.isFinite(num) && num >= 1 && num <= 5;
        },
    },
    maxCachedChannels: {
        type: OptionType.NUMBER,
        default: 5,
        description: "Maximum channels to keep in cache (1–20)",
        isValid: v => {
            const num = typeof v === "string" ? Number(v) : v;
            return Number.isFinite(num) && num >= 1 && num <= 20;
        },
    },
});

// ============================================================
// Types
// ============================================================

type ViewMode = "gallery" | "single";

export type GalleryCache = {
    items: GalleryItem[];
    stableIds: Set<string>;
    failedIds: Set<string>;
    oldestMessageId: string | null;
    hasMore: boolean;
    lastAccessed: number;
};

// ============================================================
// LRU Cache with bounded size
// ============================================================

const MAX_CACHE_DEFAULT = 5;
const cacheByChannel = new Map<string, GalleryCache>();

function getMaxCachedChannels(): number {
    return Math.max(1, Math.min(20, Math.floor(settings.store.maxCachedChannels ?? MAX_CACHE_DEFAULT)));
}

function evictOldestCache(): void {
    if (cacheByChannel.size <= getMaxCachedChannels()) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cache] of cacheByChannel) {
        if (cache.lastAccessed < oldestTime) {
            oldestTime = cache.lastAccessed;
            oldestKey = key;
        }
    }

    if (oldestKey) {
        log.debug("data", "Evicting oldest cache", { channelId: oldestKey });
        cacheByChannel.delete(oldestKey);
    }
}

function getOrCreateCache(channelId: string): GalleryCache {
    if (!channelId) {
        log.warn("data", "getOrCreateCache called without channelId");
        return {
            items: [],
            stableIds: new Set(),
            failedIds: new Set(),
            oldestMessageId: null,
            hasMore: true,
            lastAccessed: Date.now()
        };
    }

    const existing = cacheByChannel.get(channelId);
    if (existing) {
        existing.lastAccessed = Date.now();
        log.debug("data", "Using existing cache", { channelId, items: existing.items.length });
        return existing;
    }

    // Evict oldest before creating new
    evictOldestCache();

    log.info("data", "Creating new gallery cache", { channelId });

    const created: GalleryCache = {
        items: [],
        stableIds: new Set(),
        failedIds: new Set(),
        oldestMessageId: null,
        hasMore: true,
        lastAccessed: Date.now()
    };

    cacheByChannel.set(channelId, created);
    // Sanity check - assert that cache was stored
    log.assert(cacheByChannel.get(channelId) === created, "data", "Cache was not stored correctly", { channelId });
    return created;
}

// ============================================================
// Channel support checks
// ============================================================

function isSupportedChannel(channel: {
    isDM?: () => boolean;
    isGroupDM?: () => boolean;
    isMultiUserDM?: () => boolean;
    isThread?: () => boolean;
    isGuildVocal?: () => boolean;
    isCategory?: () => boolean;
    guild_id?: string;
} | null | undefined): boolean {
    if (!channel) return false;
    if (typeof channel.isDM === "function" && channel.isDM()) return true;
    if (typeof channel.isGroupDM === "function" && channel.isGroupDM()) return true;
    if (typeof channel.isMultiUserDM === "function" && channel.isMultiUserDM()) return true;
    if (typeof channel.isGuildVocal === "function" && channel.isGuildVocal()) return false;
    if (typeof channel.isCategory === "function" && channel.isCategory()) return false;
    if (typeof channel.isThread === "function" && channel.isThread()) return true;
    return !!channel.guild_id;
}

function canUseGallery(channel: {
    guild_id?: string;
    isDM?: () => boolean;
    isGroupDM?: () => boolean;
    isMultiUserDM?: () => boolean;
} | null | undefined): boolean {
    if (!channel) return false;
    if (!isSupportedChannel(channel)) return false;
    if (channel.guild_id && !PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel as any)) return false;
    return true;
}

// ============================================================
// Modal state management - simplified
// ============================================================

let modalKey: string | null = null;
let currentModalChannelId: string | null = null;

function closeGalleryModal(): void {
    if (modalKey) {
        log.info("lifecycle", "Closing gallery modal");
        closeModal(modalKey);
        modalKey = null;
        currentModalChannelId = null;
    }
}

// ============================================================
// Gallery Modal Component
// ============================================================

function GalleryModal(props: ModalProps & { channelId: string; settings: typeof settings.store; }) {
    const { channelId, settings: pluginSettings, ...modalProps } = props;

    // View state - local to component
    const [viewMode, setViewMode] = React.useState<ViewMode>("gallery");
    const [selectedStableId, setSelectedStableId] = React.useState<string | null>(null);

    const channel = ChannelStore.getChannel(channelId);
    let title = "Gallery";
    if (channel) {
        if (typeof channel.isDM === "function" && channel.isDM()) {
            const recipientId = channel.recipients?.[0];
            const user = recipientId ? UserStore.getUser(recipientId) : null;
            const userName = user ? (user.globalName ?? user.username) : "DM";
            title = `Gallery — ${userName}`;
        } else if (typeof channel.isGroupDM === "function" && channel.isGroupDM()) {
            title = channel.name ? `Gallery — ${channel.name}` : "Gallery — Group DM";
        } else if (channel.name) {
            title = `Gallery — #${channel.name}`;
        }
    }

    const cache = React.useMemo(() => getOrCreateCache(channelId), [channelId]);
    const [items, setItems] = React.useState<GalleryItem[]>(() => cache.items);
    const [hasMore, setHasMore] = React.useState<boolean>(() => cache.hasMore);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [error, setError] = React.useState<string | null>(null);

    // Filter out failed images
    const validItems = React.useMemo(() => {
        return items.filter(item => item && item.stableId && !cache.failedIds.has(item.stableId));
    }, [items, cache.failedIds]);

    const markAsFailed = React.useCallback((stableId: string) => {
        if (!stableId || cache.failedIds.has(stableId)) return;
        log.debug("data", "Marking item as failed", { stableId });
        cache.failedIds.add(stableId);
        setItems(prev => prev.filter(item => item.stableId !== stableId));
    }, [cache]);

    const abortRef = React.useRef<AbortController | null>(null);
    const loadingRef = React.useRef<boolean>(false);

    // Cleanup abort controller on unmount
    React.useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const loadNextChunks = React.useCallback(async (chunks: number) => {
        if (loadingRef.current) return;
        if (!hasMore) return;

        log.perfStart("load-chunks");
        log.debug("data", "Loading message chunks", {
            channelId,
            chunks,
            chunkSize: pluginSettings.chunkSize
        });

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
                    limit: Math.max(1, Math.floor(pluginSettings.chunkSize)),
                    signal: controller.signal
                });

                if (!msgs.length) {
                    localHasMore = false;
                    break;
                }

                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.id) {
                    before = String(lastMsg.id);
                    cache.oldestMessageId = before;
                } else {
                    localHasMore = false;
                    break;
                }

                log.perfStart("extract-images");
                const extracted = extractImages(msgs, channelId, {
                    includeEmbeds: pluginSettings.includeEmbeds,
                    includeGifs: pluginSettings.includeGifs
                });
                log.perfEnd("extract-images");

                for (const it of extracted) {
                    if (!it?.stableId) continue;
                    if (cache.stableIds.has(it.stableId)) continue;
                    cache.stableIds.add(it.stableId);
                    cache.items.push(it);
                }

                loadedAny = true;
            }

            log.debug("data", "Chunk load complete", {
                addedItems: cache.items.length,
                hasMore: localHasMore
            });

            if (loadedAny || !localHasMore) {
                cache.hasMore = localHasMore;
                setItems([...cache.items.filter(item => !cache.failedIds.has(item.stableId))]);
                setHasMore(cache.hasMore);
            }
        } catch (e: unknown) {
            if (e instanceof Error && (e.name === "AbortError" || e.message === "AbortError")) {
                loadingRef.current = false;
                setLoading(false);
                return;
            }
            log.error("data", "Failed to load chunks", e);
            setError("Unable to load gallery items");
            if (cache.items.length === 0) {
                cache.hasMore = false;
                setHasMore(false);
            }
        } finally {
            loadingRef.current = false;
            setLoading(false);
            log.perfEnd("load-chunks");
        }
    }, [channelId, hasMore, pluginSettings.chunkSize, pluginSettings.includeEmbeds, pluginSettings.includeGifs, cache]);

    // Initial load
    React.useEffect(() => {
        if (items.length > 0) return;
        if (loadingRef.current) return;
        void loadNextChunks(Math.max(1, Math.floor(pluginSettings.preloadChunks)));
    }, [channelId, items.length, pluginSettings.preloadChunks, loadNextChunks]);

    const handleSelect = React.useCallback((stableId: string) => {
        log.debug("lifecycle", "Transitioning to single view", { stableId });
        setSelectedStableId(stableId);
        setViewMode("single");
    }, []);

    const handleCloseSingle = React.useCallback(() => {
        log.debug("lifecycle", "Returning from single view to gallery");
        setSelectedStableId(null);
        setViewMode("gallery");
    }, []);

    const handleOpenMessage = React.useCallback(() => {
        if (!selectedStableId) return;
        const item = validItems.find(it => it && it.stableId === selectedStableId);
        if (!item || !item.messageId) return;

        log.info("lifecycle", "Jump to message and close modal", { messageId: item.messageId });

        try {
            jumper.jumpToMessage({
                channelId,
                messageId: item.messageId,
                flash: true,
                jumpType: "INSTANT"
            });
        } catch (e: unknown) {
            log.error("lifecycle", "Failed to jump to message", e);
        } finally {
            // Always close modal after attempting jump
            modalProps.onClose();
        }
    }, [selectedStableId, validItems, channelId, modalProps]);

    const downloadRef = React.useRef<HTMLAnchorElement | null>(null);

    const handleDownload = React.useCallback(async () => {
        if (!selectedStableId) return;
        const item = validItems.find(it => it && it.stableId === selectedStableId);
        if (!item || !item.url || !downloadRef.current) return;

        try {
            const response = await fetch(item.url);
            if (!response.ok) throw new Error("Failed to fetch image");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            downloadRef.current.href = url;
            downloadRef.current.download = item.filename || "image";
            downloadRef.current.click();
            window.URL.revokeObjectURL(url);
        } catch {
            downloadRef.current.href = item.url;
            downloadRef.current.download = item.filename || "image";
            downloadRef.current.target = "_blank";
            downloadRef.current.click();
        }
    }, [selectedStableId, validItems]);

    const handleFullscreen = React.useCallback(async () => {
        if (!selectedStableId || validItems.length === 0) return;

        log.info("lifecycle", "Opening fullscreen view", { selectedStableId });

        // Dynamically import to avoid circular dependencies
        const { openFullscreenView } = await import("./components/FullscreenView");

        openFullscreenView(
            validItems,
            selectedStableId,
            (newStableId: string | null) => {
                log.debug("lifecycle", "Returning from fullscreen view", { newStableId });
                if (newStableId) {
                    setSelectedStableId(newStableId);
                }
                // Stay in single view mode
            }
        );
    }, [selectedStableId, validItems]);

    const handleClose = React.useCallback((e?: MouseEvent | KeyboardEvent) => {
        if (viewMode === "single") {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            handleCloseSingle();
            return;
        }

        abortRef.current?.abort();
        log.info("lifecycle", "Gallery modal closed");
        modalProps.onClose();
    }, [viewMode, handleCloseSingle, modalProps]);

    // Keyboard navigation
    React.useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                handleClose(e);
            }
        };

        window.addEventListener("keydown", handleEscape, true);
        return () => window.removeEventListener("keydown", handleEscape, true);
    }, [handleClose]);

    const isSingleView = viewMode === "single";

    return (
        <ModalRoot {...modalProps} size={ModalSize.DYNAMIC} aria-label="Gallery" className="vc-gallery-modal-root">
            <a ref={downloadRef} style={{ display: "none" }} />
            <ModalHeader className="vc-gallery-modal-header">
                <Heading tag="h3" className="vc-gallery-modal-title">
                    {title}
                </Heading>
                {isSingleView && (
                    <>
                        <Button onClick={handleOpenMessage} variant="secondary" size="small" className="vc-gallery-button">
                            Open message
                        </Button>
                        <button onClick={handleDownload} className="vc-gallery-icon-button" aria-label="Download image">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="vc-gallery-icon">
                                <path d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" fill="currentColor" />
                            </svg>
                        </button>
                        <button onClick={handleFullscreen} className="vc-gallery-icon-button" aria-label="View fullscreen">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="vc-gallery-icon">
                                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor" />
                            </svg>
                        </button>
                    </>
                )}
                <ModalCloseButton onClick={handleClose} />
            </ModalHeader>
            <ModalContent className="vc-channel-gallery-modal">
                {isSingleView ? (
                    <SingleView
                        items={validItems}
                        selectedStableId={selectedStableId!}
                        channelId={channelId}
                        cache={cache}
                        onClose={handleCloseSingle}
                        onChange={handleSelect}
                        onOpenMessage={handleOpenMessage}
                        onMarkFailed={markAsFailed}
                    />
                ) : (
                    <GalleryView
                        items={validItems}
                        showCaptions={pluginSettings.showCaptions}
                        isLoading={loading}
                        hasMore={hasMore}
                        error={error}
                        cache={cache}
                        onRetry={() => loadNextChunks(1)}
                        onLoadMore={() => loadNextChunks(1)}
                        onSelect={handleSelect}
                        onMarkFailed={markAsFailed}
                    />
                )}
            </ModalContent>
        </ModalRoot>
    );
}

// ============================================================
// Toggle Gallery
// ============================================================

function toggleGallery(channelId: string): void {
    if (!channelId) {
        log.warn("lifecycle", "toggleGallery called with no channelId");
        return;
    }

    if (modalKey) {
        log.debug("lifecycle", "Toggling gallery closed", { channelId });
        closeGalleryModal();
        return;
    }

    log.info("lifecycle", "Opening gallery modal", { channelId });
    currentModalChannelId = channelId;

    modalKey = openModal(
        ErrorBoundary.wrap(modalProps => (
            <GalleryModal
                {...modalProps}
                channelId={channelId}
                settings={settings.store}
            />
        ), { noop: true }),
        {
            onCloseCallback: () => {
                log.info("lifecycle", "Gallery modal close callback");
                modalKey = null;
                currentModalChannelId = null;
            }
        }
    );
}

// ============================================================
// Toolbar Button
// ============================================================

function GalleryToolbarButton() {
    const channelId = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId());
    const channel = useStateFromStores(
        [ChannelStore, SelectedChannelStore],
        () => channelId ? ChannelStore.getChannel(channelId) : null,
        [channelId]
    );

    const supported = canUseGallery(channel);
    const selected = Boolean(modalKey && currentModalChannelId === channelId);

    // Close modal if channel changes
    React.useEffect(() => {
        if (!modalKey || !currentModalChannelId || currentModalChannelId === channelId) return;
        closeGalleryModal();
    }, [channelId]);

    const handleClick = React.useCallback(() => {
        if (!channelId) return;
        toggleGallery(channelId);
    }, [channelId]);

    return (
        <ChannelToolbarButton
            icon={GalleryIcon}
            tooltip="Gallery"
            disabled={!supported}
            selected={selected}
            onClick={handleClick}
        />
    );
}

// ============================================================
// Plugin Definition
// ============================================================

export default definePlugin({
    name: "ChannelGallery",
    description: "Adds a Gallery view for images in the current channel",
    authors: [EquicordDevs.benjii, EquicordDevs.FantasticLoki],
    dependencies: ["HeaderBarAPI"],

    settings,

    patches: [
        {
            find: ".dimensionlessImage,",
            replacement: {
                match: /(?<=null!=(\i)\?.{0,20})\i\.\i,{children:\1/,
                replace: "'div',{onClick:e=>$self.handleMediaViewerClick(e),children:$1"
            },
            predicate: () => !isPluginEnabled("ImageZoom")
        },
    ],

    start() {
        log.info("lifecycle", "ChannelGallery plugin started");
    },

    handleMediaViewerClick(e: MouseEvent) {
        if (!e || e.button !== 0) return;
        try {
            if (e.stopPropagation) e.stopPropagation();
        } catch { }

        const el = e.currentTarget as HTMLElement | null;
        if (!el) return;
        if (typeof el.getBoundingClientRect !== "function") return;

        const rect = el.getBoundingClientRect();
        const x = (e.clientX ?? 0) - rect.left;
        const key = x < rect.width / 2 ? "ArrowLeft" : "ArrowRight";

        try {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        } catch { }
    },

    headerBarButton: {
        location: "channeltoolbar",
        icon: GalleryIcon,
        render: GalleryToolbarButton,
        priority: 250
    },

    stop() {
        log.info("lifecycle", "ChannelGallery plugin stopping");

        cacheByChannel.clear();
        closeGalleryModal();

        log.info("lifecycle", "ChannelGallery plugin stopped");
    }
});
