/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, React, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";

import type { GalleryItem } from "../utils/media";

const GAP = 10;
const PADDING = 14;
const MIN_THUMB = 120;
const MAX_THUMB = 150;
const LOAD_MORE_THRESHOLD = 600;

function withSizeParams(url: string, size: number): string {
    if (!url) return url;
    try {
        const u = new URL(url);
        u.searchParams.set("width", String(size));
        u.searchParams.set("height", String(size));
        return u.toString();
    } catch {
        return url;
    }
}

function getThumbUrl(item: GalleryItem, size: number): string {
    if (!item) return "";
    const url = item.proxyUrl ?? item.url;
    if (!url) return "";
    return withSizeParams(url, size);
}

export function GalleryView(props: {
    items: GalleryItem[];
    showCaptions: boolean;
    isLoading: boolean;
    hasMore: boolean;
    error: string | null;
    onRetry(): void;
    onLoadMore(): void;
    onSelect(stableId: string): void;
}) {
    const { items, showCaptions, isLoading, hasMore, error, onRetry, onLoadMore, onSelect } = props;

    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollTopRef = useRef<number>(0);
    const rafIdRef = useRef<number | null>(null);
    const isSelectingRef = useRef<boolean>(false);

    const [viewport, setViewport] = useState({ width: 800, height: 600 });

    // Update viewport on resize (RAF-throttled)
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const updateViewport = () => {
            if (el.clientWidth > 0 && el.clientHeight > 0) {
                setViewport({
                    width: el.clientWidth,
                    height: el.clientHeight
                });
            }
        };

        const raf1 = requestAnimationFrame(() => {
            updateViewport();
            const raf2 = requestAnimationFrame(updateViewport);
            return () => cancelAnimationFrame(raf2);
        });

        window.addEventListener("resize", updateViewport);

        return () => {
            window.removeEventListener("resize", updateViewport);
            cancelAnimationFrame(raf1);
        };
    }, []);

    // Calculate grid layout
    const gridLayout = useMemo(() => {
        const usableWidth = Math.max(1, viewport.width - PADDING * 2);
        const columns = Math.max(1, Math.floor((usableWidth + GAP) / (MIN_THUMB + GAP)));
        const cell = Math.max(MIN_THUMB, Math.min(MAX_THUMB, Math.floor((usableWidth - (columns - 1) * GAP) / columns)));
        const thumbSize = Math.max(128, Math.min(512, cell * 2));
        return { columns, cell, thumbSize };
    }, [viewport.width]);

    // RAF-throttled scroll handler for load more
    const handleScroll = useCallback(() => {
        if (rafIdRef.current !== null) return;

        rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            const el = scrollRef.current;
            if (!el) return;

            if (el.clientHeight === 0 || el.scrollHeight === 0) return;

            const { scrollTop, scrollHeight, clientHeight } = el;
            scrollTopRef.current = scrollTop;

            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            if (distanceFromBottom < LOAD_MORE_THRESHOLD && distanceFromBottom >= 0) {
                if (!isLoading && hasMore) {
                    onLoadMore();
                }
            }
        });
    }, [hasMore, isLoading, onLoadMore]);

    // Attach scroll listener
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        el.addEventListener("scroll", handleScroll, { passive: true });
        const rafId = requestAnimationFrame(handleScroll);

        return () => {
            el.removeEventListener("scroll", handleScroll);
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
            cancelAnimationFrame(rafId);
        };
    }, [handleScroll]);

    // Handle thumbnail click with stable ID
    const handleThumbClick = useCallback((e: React.MouseEvent, stableId: string) => {
        e.preventDefault();
        e.stopPropagation();

        isSelectingRef.current = true;
        const el = scrollRef.current;
        if (el) {
            scrollTopRef.current = el.scrollTop;
        }

        onSelect(stableId);

        setTimeout(() => {
            isSelectingRef.current = false;
        }, 100);
    }, [onSelect]);

    const { columns, cell, thumbSize } = gridLayout;
    const rows = Math.ceil(items.length / columns);

    return (
        <div
            ref={scrollRef}
            className="vc-channel-gallery-scroll"
        >
            <div
                className="vc-gallery-grid"
                style={{
                    gridTemplateColumns: `repeat(${columns}, ${cell}px)`,
                    gap: `${GAP}px`
                }}
            >
                {items.map(item => {
                    if (!item || !item.stableId) return null;
                    return (
                        <button
                            key={item.stableId}
                            onClick={e => handleThumbClick(e, item.stableId)}
                            onMouseDown={e => e.preventDefault()}
                            className="vc-gallery-thumbnail-button"
                        >
                            <div className="vc-gallery-thumbnail-wrapper">
                                <img
                                    src={getThumbUrl(item, thumbSize)}
                                    alt={item.filename ?? "Image"}
                                    loading="lazy"
                                    className="vc-gallery-thumbnail-image"
                                />
                            </div>
                            {showCaptions && item.filename && (
                                <div className="vc-gallery-caption" title={item.filename}>
                                    {item.filename}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="vc-gallery-status">
                {error ? (
                    <div className="vc-gallery-status-error">
                        {error}{" "}
                        <Button size={Button.Sizes.SMALL} onClick={onRetry}>
                            Retry
                        </Button>
                    </div>
                ) : isLoading ? (
                    <div className="vc-gallery-status-muted">Loading…</div>
                ) : !items.length ? (
                    <div className="vc-gallery-status-muted">No images found yet</div>
                ) : !hasMore ? (
                    <div className="vc-gallery-status-muted">End of history</div>
                ) : null}
            </div>
        </div>
    );
}
