import { Button, React, useEffect, useMemo, useRef, useState } from "@webpack/common";

import "../style.css";
import type { GalleryItem } from "../utils/extractImages";

const GAP = 10;
const PADDING = 14;
const OVERSCAN_ROWS = 3;
const MIN_THUMB = 120;
const MAX_THUMB = 150;

function withSizeParams(url: string, size: number) {
    try {
        const u = new URL(url);
        u.searchParams.set("width", String(size));
        u.searchParams.set("height", String(size));
        return u.toString();
    } catch {
        return url;
    }
}

function getThumbUrl(item: GalleryItem, size: number) {
    const url = item.proxyUrl ?? item.url;
    return withSizeParams(url, size);
}

export function GalleryGrid(props: {
    items: GalleryItem[];
    showCaptions: boolean;
    isLoading: boolean;
    hasMore: boolean;
    error: string | null;
    onRetry(): void;
    onLoadMore(): void;
    onSelect(index: number): void;
}) {
    const { items, showCaptions, isLoading, hasMore, error, onRetry, onLoadMore, onSelect } = props;

    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollPositionRef = useRef<number>(0);
    const [viewport, setViewport] = useState({ width: 800, height: 600, scrollTop: 0 });

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const updateViewport = () => {
            // Only update if we have actual dimensions
            if (el.clientWidth > 0 && el.clientHeight > 0) {
                setViewport(v => ({ 
                    ...v, 
                    width: el.clientWidth, 
                    height: el.clientHeight 
                }));
            }
        };

        // Multiple RAF calls to ensure viewport is calculated on first load
        let raf2: number | null = null;
        const raf1 = requestAnimationFrame(() => {
            updateViewport();
            raf2 = requestAnimationFrame(() => {
                updateViewport();
                // Restore scroll position if we had one
                if (scrollPositionRef.current > 0 && el.scrollTop === 0) {
                    el.scrollTop = scrollPositionRef.current;
                }
            });
        });
        
        window.addEventListener("resize", updateViewport);

        return () => {
            window.removeEventListener("resize", updateViewport);
            cancelAnimationFrame(raf1);
            if (raf2 !== null) cancelAnimationFrame(raf2);
        };
    }, []);

    // Recalculate viewport when items change (especially on initial load)
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || items.length === 0) return;

        // Wait for items to render, then recalculate viewport
        const raf1 = requestAnimationFrame(() => {
            const raf2 = requestAnimationFrame(() => {
                if (el.clientWidth > 0 && el.clientHeight > 0) {
                    setViewport(v => ({
                        ...v,
                        width: el.clientWidth,
                        height: el.clientHeight
                    }));
                }
            });
            return () => cancelAnimationFrame(raf2);
        });

        return () => cancelAnimationFrame(raf1);
    }, [items.length]);

    const usableWidth = Math.max(1, viewport.width - PADDING * 2);
    const columns = Math.max(1, Math.floor((usableWidth + GAP) / (MIN_THUMB + GAP)));
    const cell = Math.max(MIN_THUMB, Math.min(MAX_THUMB, Math.floor((usableWidth - (columns - 1) * GAP) / columns)));
    const thumbSize = Math.max(128, Math.min(512, cell * 2));
    const rowHeight = cell + GAP;
    const rows = Math.ceil(items.length / columns);
    const totalHeight = rows * rowHeight + PADDING * 2;

    const { startIndex, endIndex } = useMemo(() => {
        const startRow = Math.max(0, Math.floor((viewport.scrollTop - PADDING) / rowHeight) - OVERSCAN_ROWS);
        const endRow = Math.min(rows, Math.ceil((viewport.scrollTop + viewport.height) / rowHeight) + OVERSCAN_ROWS);
        return {
            startIndex: startRow * columns,
            endIndex: Math.min(items.length, endRow * columns)
        };
    }, [columns, items.length, rowHeight, rows, viewport.height, viewport.scrollTop]);

    // Infinite load: check scroll position to load more
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const checkLoadMore = () => {
            // Don't check if container isn't ready
            if (el.clientHeight === 0 || el.scrollHeight === 0) return;

            const scrollTop = el.scrollTop;
            const scrollHeight = el.scrollHeight;
            const clientHeight = el.clientHeight;

            // Load more when within 600px of bottom
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            if (distanceFromBottom < 600 && distanceFromBottom >= 0) {
                if (!isLoading && hasMore) {
                onLoadMore();
                }
            }
        };

        el.addEventListener("scroll", checkLoadMore);
        
        // Use requestAnimationFrame to ensure DOM is ready
        const rafId = requestAnimationFrame(() => {
            checkLoadMore();
        });
        
        return () => {
            el.removeEventListener("scroll", checkLoadMore);
            cancelAnimationFrame(rafId);
        };
    }, [hasMore, isLoading, onLoadMore, items.length]);

    return (
        <div
            ref={scrollRef}
            className="vc-channel-gallery-scroll"
            onScroll={e => {
                const el = e.currentTarget;
                const scrollTop = el.scrollTop;
                scrollPositionRef.current = scrollTop;
                setViewport(v => ({ ...v, scrollTop }));
            }}
        >
            <div className="vc-gallery-grid-container" style={{ height: totalHeight }}>
                {items.slice(startIndex, endIndex).map((item, i) => {
                    const idx = startIndex + i;
                    const row = Math.floor(idx / columns);
                    const col = idx % columns;

                    return (
                        <button
                            key={item.key}
                            onClick={(e) => {
                                // Prevent any scroll interference
                                e.preventDefault();
                                e.stopPropagation();
                                onSelect(idx);
                            }}
                            className="vc-gallery-thumbnail-button"
                            style={{
                                left: `${col * (cell + GAP)}px`,
                                top: `${row * rowHeight}px`,
                                width: `${cell}px`,
                                height: `${cell}px`
                            }}
                        >
                            <div
                                className="vc-gallery-thumbnail-wrapper"
                                style={{
                                    width: `${cell}px`,
                                    height: `${cell}px`
                                }}
                            >
                                <img
                                    src={getThumbUrl(item, thumbSize)}
                                    alt={item.filename ?? "Image"}
                                    loading="lazy"
                                    className="vc-gallery-thumbnail-image"
                                />
                            </div>
                            {showCaptions && item.filename && (
                                <div
                                    className="vc-gallery-caption"
                                    title={item.filename}
                                    style={{ width: `${cell}px` }}
                                >
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
