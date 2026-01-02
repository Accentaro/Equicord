/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, ListScrollerThin, TabBar, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";
import type { MouseEvent } from "react";

import { log } from "../utils/logging";
import type { GalleryItem } from "../utils/media";

const GAP = 10;
const PADDING = 14;
const MIN_THUMB = 120;
const MAX_THUMB = 150;
const BUFFER_ROWS = 2;
const LOAD_MORE_THRESHOLD_ROWS = 3;

type FilterType = "newest" | "oldest" | "animated";

function withSizeParams(url: string, size: number): string {
    if (!url) return url;
    try {
        const u = new URL(url);
        const hostname = u.hostname.toLowerCase();
        // Don't add size params to URLs that don't support them
        if (hostname.includes("githubusercontent.com") ||
            hostname.includes("youtube.com") ||
            hostname.includes("youtu.be") ||
            hostname.includes("vimeo.com") ||
            hostname.includes("instagram.com") ||
            hostname.includes("tenor.com")) {
            return url;
        }
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

    // Skip size params for animated/video media
    if (item.isAnimated || item.isVideo) {
        return url;
    }

    // Skip size params for YouTube URLs
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
        return url;
    }

    return withSizeParams(url, size);
}

function getItemExt(item: GalleryItem): string {
    return item.filename?.toLowerCase().split(".").pop() ||
        item.url.toLowerCase().split(".").pop()?.split("?")[0] || "";
}

function filterItems(items: GalleryItem[], filter: FilterType): GalleryItem[] {
    const ANIMATED_EXTS = ["gif", "mp4", "webm", "mov", "m4v"];
    let filtered = [...items];

    if (filter === "animated") {
        filtered = filtered.filter(item => {
            if (item.isAnimated !== true) return false;
            const ext = getItemExt(item);
            return !ext || ANIMATED_EXTS.includes(ext);
        });
    } else if (filter === "newest" || filter === "oldest") {
        filtered = filtered.filter(item => {
            if (item.isAnimated === true) {
                const ext = getItemExt(item);
                if (ext && ANIMATED_EXTS.includes(ext)) return false;
            }
            return item.isAnimated !== true;
        });
        if (filter === "oldest") filtered = filtered.reverse();
    }

    return filtered;
}

// Thumbnail component
interface ThumbnailProps {
    item: GalleryItem;
    thumbSize: number;
    cell: number;
    showCaptions: boolean;
    onSelect: (stableId: string) => void;
    onMarkFailed: (stableId: string) => void;
}

function ThumbnailItem({
    item,
    thumbSize,
    cell,
    showCaptions,
    onSelect,
    onMarkFailed
}: ThumbnailProps) {
    const [videoFailed, setVideoFailed] = useState(false);

    const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(item.stableId);
    }, [item.stableId, onSelect]);

    const handleVideoError = useCallback(() => {
        setVideoFailed(true);
        onMarkFailed(item.stableId);
    }, [item.stableId, onMarkFailed]);

    const handleImageError = useCallback(() => {
        onMarkFailed(item.stableId);
    }, [item.stableId, onMarkFailed]);

    const thumbUrl = getThumbUrl(item, thumbSize);
    const isVideo = item.isVideo && !item.isEmbed && !videoFailed;

    return (
        <button
            onClick={handleClick}
            onMouseDown={e => e.preventDefault()}
            className="vc-gallery-thumbnail-button"
            style={{ width: cell }}
        >
            <div className="vc-gallery-thumbnail-wrapper">
                {isVideo ? (
                    <video
                        src={thumbUrl}
                        className="vc-gallery-thumbnail-image"
                        muted
                        loop
                        playsInline
                        onError={handleVideoError}
                    />
                ) : (
                    <img
                        src={thumbUrl}
                        alt={item.filename ?? "Image"}
                        loading="lazy"
                        className="vc-gallery-thumbnail-image"
                        onError={handleImageError}
                    />
                )}
            </div>
            {showCaptions && item.filename && (
                <div className="vc-gallery-caption" title={item.filename}>
                    {item.filename}
                </div>
            )}
        </button>
    );
}

export function GalleryView(props: {
    items: GalleryItem[];
    showCaptions: boolean;
    isLoading: boolean;
    hasMore: boolean;
    error: string | null;
    cache: { failedIds: Set<string>; };
    onRetry(): void;
    onLoadMore(): void;
    onSelect(stableId: string): void;
    onMarkFailed(stableId: string): void;
}) {
    const { items, showCaptions, isLoading, hasMore, error, onRetry, onLoadMore, onSelect, onMarkFailed } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ width: 800, height: 600 });
    const [filter, setFilter] = useState<FilterType>("newest");

    // Initialize and track viewport size
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateViewport = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setViewport({ width: rect.width, height: rect.height });
            }
        };

        // Initial measurement with RAF to ensure DOM is ready
        requestAnimationFrame(updateViewport);
        window.addEventListener("resize", updateViewport);
        return () => window.removeEventListener("resize", updateViewport);
    }, []);

    // Calculate grid layout
    const gridLayout = useMemo(() => {
        const usableWidth = Math.max(1, viewport.width - PADDING * 2);
        const columns = Math.max(1, Math.floor((usableWidth + GAP) / (MIN_THUMB + GAP)));
        const cell = Math.max(
            MIN_THUMB,
            Math.min(MAX_THUMB, Math.floor((usableWidth - (columns - 1) * GAP) / columns))
        );
        const thumbSize = Math.max(128, Math.min(512, cell * 2));
        // Row height includes gap + caption space if enabled
        const rowHeight = cell + GAP + (showCaptions ? 24 : 0);

        log.debug("grid", "Grid calculation", {
            viewportWidth: viewport.width,
            usableWidth,
            columns,
            cell,
            thumbSize,
            rowHeight
        });

        return { columns, cell, thumbSize, rowHeight };
    }, [viewport.width, showCaptions]);

    // Filter items
    const filteredItems = useMemo(() => filterItems(items, filter), [items, filter]);

    // Group items into rows for virtualization
    const { rows, totalRows } = useMemo(() => {
        const { columns } = gridLayout;
        const rowsArr: GalleryItem[][] = [];

        for (let i = 0; i < filteredItems.length; i += columns) {
            rowsArr.push(filteredItems.slice(i, i + columns));
        }

        return { rows: rowsArr, totalRows: rowsArr.length };
    }, [filteredItems, gridLayout]);

    // Check if we need to load more when approaching bottom
    const handleRowRender = useCallback((rowIndex: number) => {
        if (!hasMore || isLoading) return;

        const remainingRows = totalRows - rowIndex - 1;
        if (remainingRows <= LOAD_MORE_THRESHOLD_ROWS) {
            log.debug("data", "Near bottom, loading more", { rowIndex, totalRows, remainingRows });
            onLoadMore();
        }
    }, [hasMore, isLoading, totalRows, onLoadMore]);

    // Render a single row of thumbnails
    const renderRow = useCallback((rowData: { section: number; row: number; }) => {
        const rowItems = rows[rowData.row];
        if (!rowItems) return null;

        // Trigger load more check
        handleRowRender(rowData.row);

        return (
            <div
                className="vc-gallery-row"
                style={{
                    display: "flex",
                    gap: GAP,
                    padding: `0 ${PADDING}px`,
                    height: gridLayout.rowHeight,
                    alignItems: "flex-start"
                }}
            >
                {rowItems.map(item => (
                    <ThumbnailItem
                        key={item.stableId}
                        item={item}
                        thumbSize={gridLayout.thumbSize}
                        cell={gridLayout.cell}
                        showCaptions={showCaptions}
                        onSelect={onSelect}
                        onMarkFailed={onMarkFailed}
                    />
                ))}
            </div>
        );
    }, [rows, gridLayout, showCaptions, onSelect, onMarkFailed, handleRowRender]);

    // Render footer with status
    const renderFooter = useCallback(() => {
        return (
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
                ) : !filteredItems.length ? (
                    <div className="vc-gallery-status-muted">
                        No {filter === "animated" ? "animated " : ""}images found yet
                    </div>
                ) : !hasMore && filteredItems.length > 0 ? (
                    <div className="vc-gallery-status-muted">End of history</div>
                ) : null}
            </div>
        );
    }, [error, isLoading, filteredItems.length, filter, hasMore, onRetry]);

    const handleFilterChange = useCallback((id: string) => {
        setFilter(id as FilterType);
    }, []);

    return (
        <div className="vc-gallery-view-container" ref={containerRef}>
            <TabBar
                type="top"
                look="grey"
                selectedItem={filter}
                onItemSelect={handleFilterChange}
                className="vc-gallery-tabbar"
            >
                <TabBar.Item id="newest">Newest</TabBar.Item>
                <TabBar.Item id="oldest">Oldest</TabBar.Item>
                <TabBar.Item id="animated">Animated</TabBar.Item>
            </TabBar>

            {totalRows > 0 ? (
                <ListScrollerThin
                    className="vc-channel-gallery-scroll"
                    sections={[totalRows]}
                    sectionHeight={0}
                    rowHeight={gridLayout.rowHeight}
                    renderSection={() => null}
                    renderRow={renderRow}
                    renderFooter={renderFooter}
                    footerHeight={60}
                    paddingTop={PADDING}
                    paddingBottom={PADDING}
                    chunkSize={10}
                />
            ) : (
                <div className="vc-channel-gallery-scroll">
                    {renderFooter()}
                </div>
            )}
        </div>
    );
}
