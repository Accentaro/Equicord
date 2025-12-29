/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ChannelToolbarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { EquicordDevs } from "@utils/constants";
import { closeModal, ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, PermissionsBits, PermissionStore, React, SelectedChannelStore, useStateFromStores } from "@webpack/common";

import { openFullscreenView } from "./components/FullscreenView";
import { GalleryView } from "./components/GalleryView";
import { SingleView } from "./components/SingleView";
import { extractImages, GalleryIcon, GalleryItem } from "./utils/media";
import { fetchMessagesChunk } from "./utils/pagination";

// Note: We don't use ChannelTypes anymore - we rely entirely on Channel class methods
// which are more reliable and don't require webpack module resolution
const jumper: any = findByPropsLazy("jumpToMessage");

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
    }
});

type ViewMode = "closed" | "gallery" | "single" | "fullscreen";

type GalleryState = {
    mode: ViewMode;
    channelId: string | null;
    selectedStableId: string | null;
};

type GalleryCache = {
    items: GalleryItem[];
    stableIds: Set<string>;
    oldestMessageId: string | null;
    hasMore: boolean;
};

const cacheByChannel = new Map<string, GalleryCache>();

function getOrCreateCache(channelId: string): GalleryCache {
    if (!channelId) {
        return { items: [], stableIds: new Set(), oldestMessageId: null, hasMore: true };
    }
    const existing = cacheByChannel.get(channelId);
    if (existing) return existing;
    const created: GalleryCache = {
        items: [],
        stableIds: new Set(),
        oldestMessageId: null,
        hasMore: true
    };
    cacheByChannel.set(channelId, created);
    return created;
}

function isSupportedChannel(channel: { type?: number; isDM?: () => boolean; isGroupDM?: () => boolean; isMultiUserDM?: () => boolean; isThread?: () => boolean; isGuildVocal?: () => boolean; isCategory?: () => boolean; guild_id?: string } | null | undefined): boolean {
    if (!channel) return false;

    // Exclude DMs/group DMs using Channel class methods (primary check - most reliable)
    if (typeof channel.isDM === "function" && channel.isDM()) return false;
    if (typeof channel.isGroupDM === "function" && channel.isGroupDM()) return false;
    if (typeof channel.isMultiUserDM === "function" && channel.isMultiUserDM()) return false;

    // Use Channel class methods for type checking (preferred method)
    if (typeof channel.isThread === "function" && channel.isThread()) return true;
    if (typeof channel.isGuildVocal === "function" && channel.isGuildVocal()) return false;
    if (typeof channel.isCategory === "function" && channel.isCategory()) return false;

    // If we have guild_id, it's likely a guild channel (text/thread/forum/etc)
    // This is a safe fallback that works without ChannelTypes
    if (channel.guild_id) {
        // Exclude voice/stage channels and categories (already checked above)
        // If we got here, it's likely a text-based channel
        return true;
    }

    // No guild_id and not a DM (already checked) - likely unsupported
    return false;
}

function canUseGallery(channel: { guild_id?: string; type?: number; isDM?: () => boolean; isGroupDM?: () => boolean; isMultiUserDM?: () => boolean } | null | undefined): boolean {
    if (!channel) return false;
    if (!isSupportedChannel(channel) || (channel.guild_id && !PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel as any))) return false;
    return true;
}

let globalState: GalleryState = { mode: "closed", channelId: null, selectedStableId: null };
let modalKey: string | null = null;
const stateListeners = new Set<() => void>();
let isOpeningFullscreen = false;
let pendingFullscreen: { items: GalleryItem[]; selectedStableId: string; channelId: string } | null = null;

function setState(updates: Partial<GalleryState>): void {
    const oldState = { ...globalState };
    globalState = { ...globalState, ...updates };
    console.log("[Gallery] setState - State updated", { 
        oldState, 
        newState: globalState, 
        updates 
    });
    stateListeners.forEach(listener => listener());
}

function GalleryModal(props: ModalProps & { channelId: string; settings: typeof settings.store }) {
    const { channelId, settings: pluginSettings, ...modalProps } = props;

    const channel = ChannelStore.getChannel(channelId);
    const title = channel?.name ? `Gallery — #${channel.name}` : "Gallery";

    const cache = React.useMemo(() => getOrCreateCache(channelId), [channelId]);
    const [items, setItems] = React.useState<GalleryItem[]>(() => cache.items);
    const [hasMore, setHasMore] = React.useState<boolean>(() => cache.hasMore);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [error, setError] = React.useState<string | null>(null);
    const [localState, setLocalState] = React.useState<GalleryState>(() => globalState);

    const abortRef = React.useRef<AbortController | null>(null);
    const loadingRef = React.useRef<boolean>(false);

    // Subscribe to global state changes
    React.useEffect(() => {
        const listener = () => setLocalState({ ...globalState });
        stateListeners.add(listener);
        return () => { stateListeners.delete(listener); };
    }, []);

    React.useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const loadNextChunks = React.useCallback(async (chunks: number) => {
        console.log("[Gallery] loadNextChunks - Called", { chunks, hasMore, loading: loadingRef.current });
        
        if (loadingRef.current) {
            console.log("[Gallery] loadNextChunks - Early return: already loading");
            return;
        }
        if (!hasMore) {
            console.log("[Gallery] loadNextChunks - Early return: no more items");
            return;
        }

        console.log("[Gallery] loadNextChunks - Starting load", { chunks });
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

                before = msgs[msgs.length - 1]?.id ?? before;
                cache.oldestMessageId = before;

                const extracted = extractImages(msgs, channelId, {
                    includeEmbeds: pluginSettings.includeEmbeds,
                    includeGifs: pluginSettings.includeGifs
                });

                for (const it of extracted) {
                    if (!it?.stableId) continue;
                    if (cache.stableIds.has(it.stableId)) continue;
                    cache.stableIds.add(it.stableId);
                    cache.items.push(it);
                }

                loadedAny = true;
            }

            if (loadedAny || !localHasMore) {
                cache.hasMore = localHasMore;
                setItems([...cache.items]);
                setHasMore(cache.hasMore);
                console.log("[Gallery] loadNextChunks - Load complete", { 
                    loadedAny, 
                    hasMore: cache.hasMore, 
                    totalItems: cache.items.length 
                });
            }
        } catch (e: unknown) {
            if (e instanceof Error && (e.name === "AbortError" || e.message === "AbortError")) {
                console.log("[Gallery] loadNextChunks - Aborted");
                loadingRef.current = false;
                setLoading(false);
                return;
            }
            console.error("[Gallery] loadNextChunks - Error:", e);
            setError("Unable to load gallery items");
            if (cache.items.length === 0) {
                cache.hasMore = false;
                setHasMore(false);
            }
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [channelId, hasMore, pluginSettings.chunkSize, pluginSettings.includeEmbeds, pluginSettings.includeGifs, cache]);

    React.useEffect(() => {
        if (items.length > 0) return;
        if (loadingRef.current) return;
        void loadNextChunks(Math.max(1, Math.floor(pluginSettings.preloadChunks)));
    }, [channelId, items.length, pluginSettings.preloadChunks, loadNextChunks]);

    const handleSelect = React.useCallback((stableId: string) => {
        console.log("[Gallery] handleSelect - Opening single view", { stableId, channelId });
        setState({ mode: "single", channelId, selectedStableId: stableId });
    }, [channelId]);

    const handleCloseSingle = React.useCallback(() => {
        console.log("[Gallery] handleCloseSingle - Closing single view, returning to gallery", { channelId });
        setState({ mode: "gallery", channelId, selectedStableId: null });
    }, [channelId]);

    const handleFullscreen = React.useCallback(() => {
        console.log("[Gallery] handleFullscreen - Called", { 
            selectedStableId: localState.selectedStableId, 
            itemsLength: items.length,
            mode: localState.mode,
            isOpeningFullscreen 
        });
        
        if (!localState.selectedStableId || items.length === 0) {
            console.log("[Gallery] handleFullscreen - Early return: no selection or items");
            return;
        }
        if (isOpeningFullscreen) {
            console.log("[Gallery] handleFullscreen - Early return: already opening");
            return;
        }
        if (localState.mode !== "single") {
            console.log("[Gallery] handleFullscreen - Early return: not in single view mode", { mode: localState.mode });
            return;
        }

        console.log("[Gallery] handleFullscreen - Starting fullscreen process");
        isOpeningFullscreen = true;

        // Store the selected stable ID
        const currentStableId = localState.selectedStableId;
        const currentChannelId = channelId;

        // Use cached items immediately - no preloading, fullscreen will handle lazy loading as user scrolls
        const allItems = cache.items.length > items.length ? cache.items : items;
        console.log("[Gallery] handleFullscreen - Items prepared (using cache)", { 
            allItemsCount: allItems.length, 
            cacheItemsCount: cache.items.length, 
            stateItemsCount: items.length 
        });
        
        if (allItems.length === 0) {
            console.log("[Gallery] handleFullscreen - Early return: no items to show");
            isOpeningFullscreen = false;
            return;
        }

        // Store fullscreen data - open immediately with cached items
        pendingFullscreen = {
            items: allItems,
            selectedStableId: currentStableId,
            channelId: currentChannelId
        };
        console.log("[Gallery] handleFullscreen - Stored pending fullscreen data", { 
            selectedStableId: currentStableId, 
            itemsCount: allItems.length,
            channelId: currentChannelId 
        });

        // Close the gallery modal - fullscreen will open in onCloseCallback
        console.log("[Gallery] handleFullscreen - Closing gallery modal to allow fullscreen");
        modalProps.onClose();
    }, [localState.selectedStableId, localState.mode, items, hasMore, channelId, cache, loadNextChunks, modalProps]);

    const handleOpenMessage = React.useCallback(() => {
        if (!localState.selectedStableId) return;
        const item = items.find(it => it?.stableId === localState.selectedStableId);
        if (!item?.messageId) return;

        try {
            jumper.jumpToMessage({
                channelId,
                messageId: item.messageId,
                flash: true,
                jumpType: "INSTANT"
            });
        } finally {
            modalProps.onClose();
        }
    }, [localState.selectedStableId, items, channelId, modalProps]);

    const downloadRef = React.useRef<HTMLAnchorElement | null>(null);

    const handleDownload = React.useCallback(async () => {
        if (!localState.selectedStableId) return;
        const item = items.find(it => it?.stableId === localState.selectedStableId);
        if (!item?.url || !downloadRef.current) return;

        try {
            const response = await fetch(item.url);
            if (!response.ok) throw new Error("Failed to fetch image");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            downloadRef.current.href = url;
            downloadRef.current.download = item.filename || "image";
            downloadRef.current.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to download image:", error);
            downloadRef.current.href = item.url;
            downloadRef.current.download = item.filename || "image";
            downloadRef.current.target = "_blank";
            downloadRef.current.click();
        }
    }, [localState.selectedStableId, items]);

    const onCloseAll = React.useCallback(() => {
        console.log("[Gallery] onCloseAll - Closing entire gallery modal", { channelId, currentMode: localState.mode });
        abortRef.current?.abort();
        setState({ mode: "closed", channelId: null, selectedStableId: null });
        modalProps.onClose();
    }, [modalProps, channelId, localState.mode]);

    const isSingleView = localState.mode === "single" && localState.channelId === channelId;

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE} aria-label="Gallery">
            <a ref={downloadRef} style={{ display: "none" }} />
            <ModalHeader>
                <Heading tag="h3" className="vc-gallery-modal-title">
                    {title}
                </Heading>
                {isSingleView && (
                    <>
                        <button onClick={handleOpenMessage} className="vc-gallery-button">
                            Open message
                        </button>
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
                <ModalCloseButton onClick={onCloseAll} />
            </ModalHeader>
            <ModalContent className="vc-channel-gallery-modal">
                {isSingleView ? (
                    <SingleView
                        items={items}
                        selectedStableId={localState.selectedStableId!}
                        channelId={channelId}
                        onClose={handleCloseSingle}
                        onChange={handleSelect}
                        onOpenMessage={onCloseAll}
                    />
                ) : localState.mode === "gallery" ? (
                    <GalleryView
                        items={items}
                        showCaptions={pluginSettings.showCaptions}
                        isLoading={loading}
                        hasMore={hasMore}
                        error={error}
                        onRetry={() => loadNextChunks(1)}
                        onLoadMore={() => loadNextChunks(1)}
                        onSelect={handleSelect}
                    />
                ) : null}
            </ModalContent>
        </ModalRoot>
    );
}

function toggleGallery(channelId: string): void {
    console.log("[Gallery] toggleGallery - Called", { channelId, hasModal: !!modalKey, currentModalKey: modalKey });
    
    if (!channelId) {
        console.log("[Gallery] toggleGallery - Early return: no channelId");
        return;
    }

    if (modalKey) {
        console.log("[Gallery] toggleGallery - Closing existing modal", { modalKey });
        closeModal(modalKey);
        modalKey = null;
        setState({ mode: "closed", channelId: null, selectedStableId: null });
        return;
    }

    console.log("[Gallery] toggleGallery - Opening gallery modal", { channelId });
    setState({ mode: "gallery", channelId, selectedStableId: null });
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
                console.log("[Gallery] Modal onCloseCallback - Gallery modal closed", { 
                    modalKey, 
                    hasPendingFullscreen: !!pendingFullscreen 
                });
                modalKey = null;
                
                // Check if we need to open fullscreen after modal closes
                if (pendingFullscreen) {
                    const { items, selectedStableId, channelId: fsChannelId } = pendingFullscreen;
                    console.log("[Gallery] Modal onCloseCallback - Opening fullscreen", { 
                        selectedStableId, 
                        itemsCount: items.length, 
                        channelId: fsChannelId 
                    });
                    pendingFullscreen = null;
                    isOpeningFullscreen = false;
                    
                    // Open fullscreen modal now that gallery modal is closed
                    openFullscreenView(
                        items,
                        selectedStableId,
                        () => {
                            console.log("[Gallery] Fullscreen onCloseCallback - Fullscreen closed, reopening gallery", { 
                                channelId: fsChannelId, 
                                selectedStableId 
                            });
                            // When fullscreen closes, reopen gallery modal in single view mode
                            setState({ mode: "single", channelId: fsChannelId, selectedStableId });
                            
                            modalKey = openModal(
                                ErrorBoundary.wrap(modalProps => (
                                    <GalleryModal
                                        {...modalProps}
                                        channelId={fsChannelId}
                                        settings={settings.store}
                                    />
                                ), { noop: true }),
                                {
                                    onCloseCallback: () => {
                                        console.log("[Gallery] Reopened Modal onCloseCallback - Gallery closed again");
                                        modalKey = null;
                                        setState({ mode: "closed", channelId: null, selectedStableId: null });
                                    }
                                }
                            );
                            console.log("[Gallery] Fullscreen onCloseCallback - Gallery modal reopened", { modalKey });
                        }
                    );
                } else {
                    console.log("[Gallery] Modal onCloseCallback - No pending fullscreen, closing normally");
                    setState({ mode: "closed", channelId: null, selectedStableId: null });
                }
            }
        }
    );
}

function GalleryToolbarButton() {
    const channelId = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId());
    const channel = useStateFromStores(
        [ChannelStore, SelectedChannelStore],
        () => channelId ? ChannelStore.getChannel(channelId) : null,
        [channelId]
    );

    const supported = canUseGallery(channel);
    const selected = Boolean(modalKey && globalState.channelId === channelId && globalState.mode !== "closed");

    React.useEffect(() => {
        if (!modalKey || !globalState.channelId || globalState.channelId === channelId) return;
        closeModal(modalKey);
    }, [channelId]);

    const handleClick = () => {
        if (!channelId) return;
        toggleGallery(channelId);
    };

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

export default definePlugin({
    name: "ChannelGallery",
    description: "Adds a Gallery view for images in the current channel",
    authors: [EquicordDevs.benjii],
    dependencies: ["HeaderBarAPI"],

    settings,

    patches: [
        {
            find: ".dimensionlessImage,",
            replacement: {
                match: /(?<=null!=(\i)\?.{0,20})\i\.\i,{children:\1/,
                replace: "'div',{onClick:e=>$self.handleMediaViewerClick(e),children:$1"
            }
        }
    ],

    handleMediaViewerClick(e: React.MouseEvent) {
        if (!e || e.button !== 0) return;
        try { e.stopPropagation?.(); } catch { }

        const el = e.currentTarget as HTMLElement | null;
        if (!el?.getBoundingClientRect) return;

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
        cacheByChannel.clear();
        if (modalKey) {
            closeModal(modalKey);
            modalKey = null;
        }
        setState({ mode: "closed", channelId: null, selectedStableId: null });
        stateListeners.clear();
    }
});
