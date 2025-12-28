import { Button, React, useEffect, useMemo, useRef, useState } from "@webpack/common";

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

        // Use requestAnimationFrame to ensure element is rendered
        const rafId = requestAnimationFrame(updateViewport);
        window.addEventListener("resize", updateViewport);
        
        return () => {
            window.removeEventListener("resize", updateViewport);
            cancelAnimationFrame(rafId);
        };
    }, []);

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
                setViewport(v => ({ ...v, scrollTop: el.scrollTop }));
            }}
        >
            <div style={{ position: "relative", height: totalHeight }}>
                {items.slice(startIndex, endIndex).map((item, i) => {
                    const idx = startIndex + i;
                    const row = Math.floor(idx / columns);
                    const col = idx % columns;

                    return (
                        <button
                            key={item.key}
                            onClick={() => onSelect(idx)}
                            style={{
                                position: "absolute",
                                left: col * (cell + GAP),
                                top: row * rowHeight,
                                width: cell,
                                height: cell,
                                padding: 0,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer"
                            }}
                        >
                            <div
                                style={{
                                    width: cell,
                                    height: cell,
                                    borderRadius: 10,
                                    overflow: "hidden",
                                    background: "var(--background-secondary)"
                                }}
                            >
                                <img
                                    src={getThumbUrl(item, thumbSize)}
                                    alt={item.filename ?? "Image"}
                                    loading="lazy"
                                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                            </div>
                            {showCaptions && item.filename && (
                                <div
                                    title={item.filename}
                                    style={{
                                        marginTop: 6,
                                        fontSize: 12,
                                        color: "var(--text-muted)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        width: cell
                                    }}
                                >
                                    {item.filename}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            <div style={{ padding: "10px 0 16px", textAlign: "center" }}>
                {error ? (
                    <div style={{ color: "var(--text-danger)" }}>
                        {error}{" "}
                        <Button size={Button.Sizes.SMALL} onClick={onRetry}>
                            Retry
                        </Button>
                    </div>
                ) : isLoading ? (
                    <div style={{ color: "var(--text-muted)" }}>Loading…</div>
                ) : !items.length ? (
                    <div style={{ color: "var(--text-muted)" }}>No images found yet</div>
                ) : !hasMore ? (
                    <div style={{ color: "var(--text-muted)" }}>End of history</div>
                ) : null}
            </div>
        </div>
    );
}
