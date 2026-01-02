/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { useCallback, useEffect, useMemo, useState } from "@webpack/common";
import type { MouseEvent } from "react";

import { log } from "../utils/logging";
import type { GalleryItem } from "../utils/media";

const jumper: any = findByPropsLazy("jumpToMessage");

// Only preload images, not videos
function preload(item: GalleryItem | null | undefined): void {
    if (!item || !item.url) return;
    // Skip preloading for videos and embeds
    if (item.isVideo || item.isEmbed || item.isAnimated) return;
    new Image().src = item.url;
}

export function SingleView(props: {
    items: GalleryItem[];
    selectedStableId: string;
    channelId: string;
    cache: { failedIds: Set<string>; };
    onClose(): void;
    onChange(stableId: string): void;
    onOpenMessage(): void;
    onMarkFailed(stableId: string): void;
}) {
    const { items, selectedStableId, channelId, cache, onClose, onChange, onOpenMessage, onMarkFailed } = props;
    const [videoFailed, setVideoFailed] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);

    const selectedIndex = useMemo(() => {
        if (!items || items.length === 0 || !selectedStableId) return -1;
        return items.findIndex(item => item && item.stableId === selectedStableId);
    }, [items, selectedStableId]);

    useEffect(() => {
        // Assert selectedIndex validity in debug builds
        log.assert(
            selectedIndex >= 0 && selectedIndex < items.length,
            "lifecycle",
            "Selected index out of bounds in SingleView",
            { selectedIndex, itemsLength: items.length }
        );
    }, [selectedIndex, items.length]);

    // Auto-advance to next valid image if current one fails or is invalid
    useEffect(() => {
        if (selectedIndex < 0 || selectedIndex >= items.length) {
            // Find next valid item
            const nextValid = items.find(item => item && item.stableId && !cache.failedIds.has(item.stableId));
            if (nextValid && nextValid.stableId !== selectedStableId) {
                onChange(nextValid.stableId);
            } else if (!nextValid) {
                onClose();
            }
            return;
        }

        const item = items[selectedIndex];
        if (!item || !item.url || cache.failedIds.has(item.stableId)) {
            // Current item is invalid, find next valid
            const nextValid = items.find((it, idx) => idx > selectedIndex && it && it.stableId && !cache.failedIds.has(it.stableId));
            if (nextValid && nextValid.stableId !== selectedStableId) {
                onChange(nextValid.stableId);
            } else {
                // Try previous
                const prevValid = items.slice(0, selectedIndex).reverse().find(it => it && it.stableId && !cache.failedIds.has(it.stableId));
                if (prevValid && prevValid.stableId !== selectedStableId) {
                    onChange(prevValid.stableId);
                } else if (!prevValid && !nextValid) {
                    onClose();
                }
            }
        }
    }, [selectedIndex, items, selectedStableId, cache.failedIds, onChange, onClose]);

    // Log when selection changes for debugging/navigation tracing
    useEffect(() => {
        log.info("lifecycle", "SingleView selection changed", { selectedStableId, selectedIndex });
    }, [selectedStableId, selectedIndex]);

    if (selectedIndex < 0 || selectedIndex >= items.length) return null;

    const item = items[selectedIndex];
    if (!item || !item.url || cache.failedIds.has(item.stableId)) return null;

    // Find next/prev valid items (skip failed ones)
    const findNextValid = (startIndex: number, direction: 1 | -1): GalleryItem | null => {
        for (let i = startIndex + direction; i >= 0 && i < items.length; i += direction) {
            const it = items[i];
            if (it && it.stableId && it.url && !cache.failedIds.has(it.stableId)) {
                return it;
            }
        }
        return null;
    };

    const prevItem = findNextValid(selectedIndex, -1);
    const nextItem = findNextValid(selectedIndex, 1);
    const hasPrev = prevItem !== null;
    const hasNext = nextItem !== null;
    const prevStableId = prevItem?.stableId ?? null;
    const nextStableId = nextItem?.stableId ?? null;

    const handleJump = useCallback(() => {
        if (!item || !item.messageId) return;
        log.info("lifecycle", "Jump to message from SingleView (Enter key)", { messageId: item.messageId });
        try {
            jumper.jumpToMessage({
                channelId,
                messageId: item.messageId,
                flash: true,
                jumpType: "INSTANT"
            });
        } catch (e: unknown) {
            log.error("lifecycle", "Failed to jump to message from SingleView", e);
        } finally {
            // Close the entire modal, not just go back to grid
            onOpenMessage();
        }
    }, [item, channelId, onOpenMessage]);

    // Keyboard navigation
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                log.debug("lifecycle", "Escape pressed in SingleView - returning to gallery");
                onClose();
            } else if (e.key === "ArrowLeft" && hasPrev && prevStableId) {
                e.preventDefault();
                onChange(prevStableId);
            } else if (e.key === "ArrowRight" && hasNext && nextStableId) {
                e.preventDefault();
                onChange(nextStableId);
            } else if (e.key === "Enter") {
                e.preventDefault();
                // Enter should close modal and jump to message
                handleJump();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [hasPrev, hasNext, prevStableId, nextStableId, onClose, onChange, handleJump]);

    // Preload adjacent images (not videos)
    useEffect(() => {
        if (!items || items.length === 0) return;
        setVideoFailed(false);
        setImageFailed(false);

        // Preload prev/next valid items (only images)
        preload(prevItem);
        preload(nextItem);
    }, [items, selectedIndex, prevItem, nextItem]);

    const handlePrev = (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (hasPrev && prevStableId) {
            log.debug("lifecycle", "Navigate prev in SingleView", { prevStableId });
            onChange(prevStableId);
        }
    };

    const handleNext = (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (hasNext && nextStableId) {
            log.debug("lifecycle", "Navigate next in SingleView", { nextStableId });
            onChange(nextStableId);
        }
    };

    const handleMediaError = useCallback((isVideo: boolean) => {
        if (isVideo) {
            setVideoFailed(true);
        } else {
            setImageFailed(true);
        }
        log.warn("data", "Media failed in SingleView", { stableId: item.stableId, isVideo });
        onMarkFailed(item.stableId);
        // Auto-advance to next valid image
        if (nextStableId) {
            setTimeout(() => onChange(nextStableId), 100);
        } else if (prevStableId) {
            setTimeout(() => onChange(prevStableId), 100);
        } else {
            setTimeout(() => onClose(), 100);
        }
    }, [item.stableId, nextStableId, prevStableId, onChange, onClose, onMarkFailed]);

    const { isVideo, isAnimated, isEmbed, embedUrl } = item;

    // Determine if we should show error state
    const showError = (isVideo && videoFailed) || (!isVideo && imageFailed);

    return (
        <div className="vc-gallery-lightbox">
            <div className="vc-gallery-lightbox-content">
                {showError ? (
                    // Error UI when media fails to load
                    <div className="vc-gallery-media-error">
                        <div className="vc-gallery-media-error-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                                <path
                                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                                    fill="currentColor"
                                />
                            </svg>
                        </div>
                        <p className="vc-gallery-media-error-text">Failed to load media</p>
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="vc-gallery-media-error-link"
                        >
                            Open in browser
                        </a>
                    </div>
                ) : isEmbed && embedUrl ? (
                    <div className="vc-gallery-embed-container">
                        {embedUrl.includes("youtube.com") || embedUrl.includes("youtu.be") ? (
                            <iframe
                                src={embedUrl.replace("youtu.be/", "youtube.com/embed/").replace("watch?v=", "embed/")}
                                className="vc-gallery-embed-iframe"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        ) : embedUrl.includes("vimeo.com") ? (
                            <iframe
                                src={`https://player.vimeo.com/video/${embedUrl.split("/").pop()}`}
                                className="vc-gallery-embed-iframe"
                                allow="autoplay; fullscreen; picture-in-picture"
                                allowFullScreen
                            />
                        ) : (
                            <div className="vc-gallery-embed-fallback">
                                <div className="vc-gallery-embed-placeholder">
                                    <p>Video embed</p>
                                    <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="vc-gallery-embed-link">
                                        Open in browser
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                ) : isVideo && !videoFailed ? (
                    <video
                        src={item.proxyUrl || item.url}
                        className="vc-gallery-lightbox-image"
                        controls
                        autoPlay
                        loop={isAnimated}
                        onError={() => handleMediaError(true)}
                        onLoadedData={() => log.debug("render", "Video loaded in SingleView", { stableId: item.stableId })}
                    />
                ) : (
                    <img
                        src={item.proxyUrl || item.url}
                        alt={item.filename ?? "Image"}
                        className="vc-gallery-lightbox-image"
                        onError={() => handleMediaError(false)}
                        onLoad={() => log.debug("render", "Image loaded in SingleView", { stableId: item.stableId })}
                    />
                )}
            </div>

            <button
                disabled={!hasPrev}
                onClick={handlePrev}
                className="vc-gallery-nav-button vc-gallery-nav-button-left"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="vc-gallery-nav-icon"
                >
                    <path
                        d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z"
                        fill="currentColor"
                    />
                </svg>
            </button>
            <button
                disabled={!hasNext}
                onClick={handleNext}
                className="vc-gallery-nav-button vc-gallery-nav-button-right"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="vc-gallery-nav-icon"
                >
                    <path
                        d="M8.59 16.59L10 18L16 12L10 6L8.59 7.41L13.17 12L8.59 16.59Z"
                        fill="currentColor"
                    />
                </svg>
            </button>
        </div>
    );
}
