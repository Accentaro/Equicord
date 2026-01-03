/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findComponentByCodeLazy } from "@webpack";
import {
    Button,
    ListScrollerThin,
    React,
    SnowflakeUtils,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    UserStore,
    useState
} from "@webpack/common";
import type { MouseEvent } from "react";

import type { ManaDatePickerProps } from "../../components.dev/types/calendar";
import type { SearchBarProps } from "../../components.dev/types/input";
import type { ManaSelectOption, ManaSelectProps } from "../../components.dev/types/select";
import type { GalleryItem } from "../utils/media";

const logger = new Logger("ChannelGallery", "#8aadf4");

// Performance tracking helpers
const perfTimers = new Map<string, number>();
const MAX_PERF_TIMERS = 100;

function perfStart(name: string): void {
    // Clean up old timers if map gets too large
    if (perfTimers.size >= MAX_PERF_TIMERS) {
        const firstKey = perfTimers.keys().next().value;
        if (firstKey) perfTimers.delete(firstKey);
    }
    perfTimers.set(name, performance.now());
}

function perfEnd(name: string): void {
    const start = perfTimers.get(name);
    if (start === undefined) return;
    perfTimers.delete(name);
    const duration = performance.now() - start;
    logger.debug(`[perf] ${name} (${duration.toFixed(2)} ms)`);
}

const GAP = 10;
const PADDING = 14;
const MIN_THUMB = 120;
const MAX_THUMB = 150;
const BUFFER_ROWS = 0;
const DAY_MS = 86_400_000;
const END_OF_DAY_PAD = DAY_MS - 1;
const LOAD_MORE_THRESHOLD_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 150;

const ManaSelect = findComponentByCodeLazy('"data-mana-component":"select"') as React.ComponentType<ManaSelectProps>;
const ManaDatePicker = findComponentByCodeLazy('"data-mana-component":"date-picker"') as React.ComponentType<ManaDatePickerProps>;
const SearchBar = findComponentByCodeLazy("#{intl::SEARCH}", "clearable", "autoComplete") as React.ComponentType<SearchBarProps>;
const ManaButton = findComponentByCodeLazy('"data-mana-component":"button"') as React.ComponentType<{ onClick: () => void; text?: string; children?: React.ReactNode; size?: string; variant?: string; }>;

type SortMode = "newest" | "oldest";
type HasFilter = "all" | "images" | "videos" | "gifs";

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

    // Allow downscaled thumbs for Discord CDN even on gifs to reduce load
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const isDiscordCdn = host.includes("discordapp.net") || host.includes("discordapp.com") || host.includes("discordusercontent.com");
        if (item.isVideo) {
            return url;
        }
        if (item.isAnimated && isDiscordCdn) {
            return withSizeParams(url, size);
        }
        if (item.isAnimated) {
            return url;
        }
    } catch {
        if (item.isAnimated || item.isVideo) return url;
    }

    // Skip size params for YouTube URLs
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
        return url;
    }

    return withSizeParams(url, size);
}

function getGifStillUrl(item: GalleryItem, size: number): string {
    if (!item || !item.isAnimated || item.isVideo) return "";
    const url = item.proxyUrl ?? item.url;
    if (!url) return "";
    try {
        const u = new URL(url);
        u.searchParams.set("format", "jpeg");
        return withSizeParams(u.toString(), size);
    } catch {
        return "";
    }
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);

function getItemExt(item: GalleryItem): string {
    if (item.filename) {
        const idx = item.filename.lastIndexOf(".");
        if (idx !== -1) return item.filename.slice(idx + 1).toLowerCase();
    }
    if (item.url) {
        const urlPart = item.url.split("?")[0];
        const idx = urlPart.lastIndexOf(".");
        if (idx !== -1) return urlPart.slice(idx + 1).toLowerCase();
    }
    return "";
}

function classifyMedia(item: GalleryItem) {
    const ext = getItemExt(item);
    const contentType = item.contentType?.toLowerCase() ?? "";
    const isGif = ext === "gif" || contentType === "image/gif";
    const isVideo = Boolean(item.isVideo || VIDEO_EXTS.has(ext) || contentType.startsWith("video/"));
    const isImage = !isVideo && (IMAGE_EXTS.has(ext) || contentType.startsWith("image/") || (!ext && !contentType && !item.isVideo));
    return { isGif, isVideo, isImage };
}

function getTimestampMs(item: GalleryItem): number | null {
    if (item.timestamp) {
        const parsed = Date.parse(item.timestamp);
        if (!Number.isNaN(parsed)) return parsed;
    }
    if (item.messageId) {
        const snowflakeTs = SnowflakeUtils.extractTimestamp(item.messageId);
        if (typeof snowflakeTs === "number" && Number.isFinite(snowflakeTs)) {
            return snowflakeTs;
        }
    }
    return null;
}

function resolveDateValue(value: unknown): number | null {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof value === "object" && value) {
        const asAny = value as any;
        if (typeof asAny.toDate === "function") {
            try {
                const dateValue = asAny.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
                if (dateValue instanceof Date) return dateValue.getTime();
            } catch {
                try {
                    const fallbackDate = asAny.toDate();
                    if (fallbackDate instanceof Date) return fallbackDate.getTime();
                } catch {
                    // ignore
                }
            }
        }
        if (typeof asAny.year === "number" && typeof asAny.month === "number" && typeof asAny.day === "number") {
            const d = new Date(asAny.year, asAny.month - 1, asAny.day);
            return d.getTime();
        }
    }
    return null;
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
    const [loaded, setLoaded] = useState<boolean>(false);
    const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

    const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        logger.debug("[lifecycle] Thumbnail selected", { stableId: item.stableId });
        onSelect(item.stableId);
    }, [item.stableId, onSelect]);

    const handleVideoError = useCallback(() => {
        setVideoFailed(true);
        logger.warn("[data] Thumbnail video failed to load", { stableId: item.stableId });
        onMarkFailed(item.stableId);
    }, [item.stableId, onMarkFailed]);

    const handleImageError = useCallback(() => {
        logger.warn("[data] Thumbnail image failed to load", { stableId: item.stableId });
        onMarkFailed(item.stableId);
    }, [item.stableId, onMarkFailed]);

    // If the element is cached/ready when mounted, mark as loaded immediately
    useLayoutEffect(() => {
        if (loaded) return;
        const el = mediaRef.current;
        if (!el) return;

        if (el instanceof HTMLImageElement) {
            if (el.complete && el.naturalWidth !== 0) {
                setLoaded(true);
            }
        } else if (el instanceof HTMLVideoElement) {
            // readyState 3 (HAVE_FUTURE_DATA) or 4 (HAVE_ENOUGH_DATA) indicate playable
            if (el.readyState >= 3) {
                setLoaded(true);
            }
        }
    }, [item.stableId, loaded]);

    const thumbUrl = getThumbUrl(item, thumbSize);
    const isVideo = item.isVideo && !item.isEmbed && !videoFailed;
    const { isGif } = classifyMedia(item);
    const staticGifUrl = isGif && !isVideo ? getGifStillUrl(item, thumbSize) : "";
    const imageSrc = isVideo ? thumbUrl : (staticGifUrl || thumbUrl);

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
                        ref={mediaRef as any}
                        src={thumbUrl}
                        className="vc-gallery-thumbnail-image"
                        muted
                        loop
                        playsInline
                        onLoadedData={() => setLoaded(true)}
                        onError={handleVideoError}
                        style={{ opacity: loaded ? 1 : 0, transition: "opacity 160ms ease" }}
                    />
                ) : (
                    <img
                        ref={mediaRef as any}
                        src={imageSrc}
                        alt={item.filename ?? "Image"}
                        loading="lazy"
                        className="vc-gallery-thumbnail-image"
                        onLoad={() => setLoaded(true)}
                        onError={handleImageError}
                        style={{ opacity: loaded ? 1 : 0, transition: "opacity 160ms ease" }}
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
    failedIds: Set<string>;
    onRetry(): void;
    onLoadMore(): void;
    onSelect(stableId: string): void;
    onMarkFailed(stableId: string): void;
}) {
    const { items, showCaptions, isLoading, hasMore, error, failedIds, onRetry, onLoadMore, onSelect, onMarkFailed } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const savedScrollTopRef = useRef(0);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [sortMode, setSortMode] = useState<SortMode>("newest");
    const [hasFilter, setHasFilter] = useState<HasFilter>("all");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [queryInput, setQueryInput] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [startDateValue, setStartDateValue] = useState<any>(null);
    const [endDateValue, setEndDateValue] = useState<any>(null);
    const [dateResetKey, setDateResetKey] = useState(0);
    const loadRequestedRef = useRef(false);

    // Initialize and track viewport size using window resize listener and useLayoutEffect
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateViewport = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setViewport({ width: rect.width, height: rect.height });
            }
        };

        // Measure synchronously before paint and observe future size changes
        updateViewport();
        logger.debug("[layout] Initial viewport measure", { width: container.getBoundingClientRect().width });

        // Also run a short stability loop to catch layout changes that occur
        // shortly after mount (modal animations / async layout). We try a few
        // times with small delays and stop early when width stabilizes.
        let lastWidth = -1;
        let stableCount = 0;
        let attempts = 0;
        const maxAttempts = 10;
        let timerId: number | null = null;

        const stabilityCheck = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setViewport({ width: rect.width, height: rect.height });
                logger.debug("[layout] Viewport updated", { width: rect.width, height: rect.height });
            }

            if (Math.abs(rect.width - lastWidth) <= 1) {
                stableCount++;
            } else {
                stableCount = 0;
            }

            lastWidth = rect.width;
            attempts++;

            if (stableCount >= 2 || attempts >= maxAttempts) return;

            timerId = window.setTimeout(() => requestAnimationFrame(stabilityCheck), 50);
        };

        stabilityCheck();

        window.addEventListener("resize", updateViewport);
        return () => {
            if (timerId !== null) window.clearTimeout(timerId);
            window.removeEventListener("resize", updateViewport);
        };
    }, []);

    useEffect(() => {
        const id = window.setTimeout(() => {
            setDebouncedQuery(queryInput.trim().toLowerCase());
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(id);
    }, [queryInput]);

    // Calculate grid layout
    const gridLayout = useMemo(() => {
        perfStart("grid-calc");
        const usableWidth = Math.max(1, viewport.width - PADDING * 2);
        const columns = Math.max(1, Math.floor((usableWidth + GAP) / (MIN_THUMB + GAP)));
        const cell = Math.max(
            MIN_THUMB,
            Math.min(MAX_THUMB, Math.floor((usableWidth - (columns - 1) * GAP) / columns))
        );
        const thumbSize = Math.max(128, Math.min(512, cell * 2));
        // Row height includes gap + caption space if enabled
        const rowHeight = cell + GAP + (showCaptions ? 24 : 0);

        logger.debug("[grid] Grid calculation", {
            viewportWidth: viewport.width,
            usableWidth,
            columns,
            cell,
            thumbSize,
            rowHeight
        });

        perfEnd("grid-calc");
        return { columns, cell, thumbSize, rowHeight };
    }, [viewport.width, showCaptions]);

    const authorNames = useMemo(() => {
        const map = new Map<string, string>();
        const seen = new Set<string>();
        for (const item of items) {
            if (!item.authorId || seen.has(item.authorId)) continue;
            seen.add(item.authorId);
            const user = UserStore.getUser(item.authorId);
            if (user) {
                const name = user.globalName ?? user.username;
                if (name) map.set(item.authorId, name);
            } else if (item.authorGlobalName || item.authorUsername) {
                map.set(item.authorId, item.authorGlobalName ?? item.authorUsername ?? "");
            }
        }
        return map;
    }, [items]);

    const searchIndex = useMemo(() => {
        const index = new Map<string, string>();
        for (const item of items) {
            const parts = [
                item.filename,
                item.url,
                item.proxyUrl,
                item.embedUrl,
                item.authorId,
                authorNames.get(item.authorId ?? "") ?? item.authorGlobalName ?? item.authorUsername
            ];
            index.set(item.stableId, parts.filter(Boolean).join(" ").toLowerCase());
        }
        return index;
    }, [items, authorNames]);

    const sortedItems = useMemo(() => {
        const list = [...items];
        list.sort((a, b) => {
            const aTime = getTimestampMs(a) ?? 0;
            const bTime = getTimestampMs(b) ?? 0;
            return sortMode === "oldest" ? aTime - bTime : bTime - aTime;
        });
        return list;
    }, [items, sortMode]);

    const filteredItems = useMemo(() => {
        const startRaw = resolveDateValue(startDateValue);
        const endRaw = resolveDateValue(endDateValue);
        const [rawStart, rawEnd] = startRaw !== null && endRaw !== null && startRaw > endRaw
            ? [endRaw, startRaw]
            : [startRaw, endRaw];
        const start = rawStart;
        const end = rawEnd !== null ? rawEnd + (rawEnd % DAY_MS === 0 ? END_OF_DAY_PAD : 0) : null;
        return sortedItems.filter(item => {
            const { isGif, isVideo, isImage } = classifyMedia(item);
            switch (hasFilter) {
                case "images":
                    if (!isImage || isGif) return false;
                    break;
                case "videos":
                    if (!isVideo) return false;
                    break;
                case "gifs":
                    if (!isGif || isVideo) return false;
                    break;
                default:
                    break;
            }

            if (selectedUserId && item.authorId !== selectedUserId) return false;

            const timestampMs = getTimestampMs(item);
            if ((start !== null || end !== null)) {
                if (timestampMs === null) return false;
                if (start !== null && timestampMs < start) return false;
                if (end !== null && timestampMs > end) return false;
            }

            if (debouncedQuery) {
                const haystack = searchIndex.get(item.stableId) ?? "";
                if (!haystack.includes(debouncedQuery)) return false;
            }

            return true;
        });
    }, [sortedItems, hasFilter, selectedUserId, startDateValue, endDateValue, debouncedQuery, searchIndex]);

    const rowsPerViewport = useMemo(() => {
        if (!gridLayout.rowHeight) return 10;
        return Math.max(1, Math.ceil(viewport.height / gridLayout.rowHeight));
    }, [viewport.height, gridLayout.rowHeight]);

    // Group items into rows for virtualization
    const { rows, totalRows } = useMemo(() => {
        const { columns } = gridLayout;
        const rowsArr: GalleryItem[][] = [];

        for (let i = 0; i < filteredItems.length; i += columns) {
            rowsArr.push(filteredItems.slice(i, i + columns));
        }

        return { rows: rowsArr, totalRows: rowsArr.length };
    }, [filteredItems, gridLayout]);

    const virtualChunkSize = useMemo(() => Math.max(rowsPerViewport + BUFFER_ROWS, Math.max(1, rowsPerViewport)), [rowsPerViewport]);

    const requestLoadMore = useCallback(() => {
        if (loadRequestedRef.current || isLoading || !hasMore) return;
        if (scrollerRef.current) {
            savedScrollTopRef.current = scrollerRef.current.scrollTop;
        }
        loadRequestedRef.current = true;
        logger.debug("[data] Requesting more items from filter context", { totalRows, rowsPerViewport });
        onLoadMore();
    }, [isLoading, hasMore, onLoadMore, totalRows, rowsPerViewport]);

    useEffect(() => {
        if (!isLoading) {
            loadRequestedRef.current = false;
            const target = scrollerRef.current;
            if (target && savedScrollTopRef.current > 0) {
                target.scrollTop = Math.min(savedScrollTopRef.current, target.scrollHeight - target.clientHeight);
            }
            savedScrollTopRef.current = 0;
        }
    }, [isLoading, hasMore]);

    useEffect(() => {
        if (!hasMore || isLoading) return;
        if (totalRows === 0 || totalRows <= LOAD_MORE_THRESHOLD_ROWS) {
            requestLoadMore();
        }
    }, [hasMore, isLoading, totalRows, requestLoadMore]);

    // Check if we need to load more when approaching bottom
    const handleRowRender = useCallback((rowIndex: number) => {
        if (!hasMore || isLoading) return;

        const remainingRows = totalRows - rowIndex - 1;
        if (remainingRows <= LOAD_MORE_THRESHOLD_ROWS) {
            logger.debug("[data] Near bottom, loading more", { rowIndex, totalRows, remainingRows });
            requestLoadMore();
        }
    }, [hasMore, isLoading, totalRows, requestLoadMore]);

    const sortOptions: ManaSelectOption[] = [
        { id: "newest", value: "newest", label: "Newest" },
        { id: "oldest", value: "oldest", label: "Oldest" }
    ];

    const hasOptions: ManaSelectOption[] = [
        { id: "all", value: "all", label: "All media" },
        { id: "images", value: "images", label: "Images" },
        { id: "videos", value: "videos", label: "Videos" },
        { id: "gifs", value: "gifs", label: "GIFs" }
    ];

    const userOptions = useMemo<ManaSelectOption[]>(() => {
        const options: ManaSelectOption[] = [];
        const seen = new Set<string>();
        for (const item of items) {
            if (!item.authorId || seen.has(item.authorId)) continue;
            seen.add(item.authorId);
            const label = authorNames.get(item.authorId) ?? item.authorGlobalName ?? item.authorUsername ?? item.authorId;
            options.push({
                id: item.authorId,
                value: item.authorId,
                label
            });
        }
        return options;
    }, [items, authorNames]);

    const handleSortChange = useCallback((value: string | string[] | null) => {
        const val = Array.isArray(value) ? value[0] : value;
        setSortMode(val === "oldest" ? "oldest" : "newest");
    }, []);

    const handleHasChange = useCallback((value: string | string[] | null) => {
        const val = Array.isArray(value) ? value[0] : value;
        if (val === "images" || val === "videos" || val === "gifs" || val === "all") {
            setHasFilter(val);
        } else {
            setHasFilter("all");
        }
    }, []);

    const handleUserChange = useCallback((value: string | string[] | null) => {
        const val = Array.isArray(value) ? value[0] : value;
        setSelectedUserId(val ?? null);
    }, []);

    const handleClearDates = useCallback(() => {
        setStartDateValue(null);
        setEndDateValue(null);
        setDateResetKey(k => k + 1);
    }, []);

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
        const emptyLabel = (() => {
            switch (hasFilter) {
                case "images":
                    return "No images found";
                case "videos":
                    return "No videos found";
                case "gifs":
                    return "No GIFs found";
                default:
                    return "No media found";
            }
        })();

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
                        {emptyLabel}
                    </div>
                ) : !hasMore && filteredItems.length > 0 ? (
                    <div className="vc-gallery-status-muted">End of history</div>
                ) : null}
            </div>
        );
    }, [error, isLoading, filteredItems.length, hasFilter, hasMore, onRetry]);

    return (
        <div className="vc-gallery-view-container" ref={containerRef}>
            <div className="vc-gallery-controls">
                <div className="vc-gallery-control-row">
                    <div className="vc-gallery-control">
                        <ManaSelect
                            options={sortOptions}
                            value={sortMode}
                            onSelectionChange={handleSortChange}
                            label="Sort"
                            closeOnSelect
                        />
                    </div>
                    <div className="vc-gallery-control vc-gallery-control-grow">
                        <SearchBar
                            query={queryInput}
                            onChange={setQueryInput}
                            onClear={() => setQueryInput("")}
                            placeholder="Search media (author, filename, link)"
                        />
                    </div>
                </div>
                <div className="vc-gallery-control-row">
                    <div className="vc-gallery-control">
                        <ManaSelect
                            options={userOptions}
                            value={selectedUserId}
                            onSelectionChange={handleUserChange}
                            placeholder="From"
                            label="From"
                            clearable
                            closeOnSelect
                        />
                    </div>
                    <div className="vc-gallery-control">
                        <ManaSelect
                            options={hasOptions}
                            value={hasFilter}
                            onSelectionChange={handleHasChange}
                            placeholder="Has"
                            label="Has"
                            closeOnSelect
                        />
                    </div>
                    <div className="vc-gallery-control">
                        <ManaDatePicker
                            key={`start-${dateResetKey}`}
                            value={startDateValue ?? null}
                            onChange={setStartDateValue}
                            granularity="day"
                            label="Date from"
                        />
                    </div>
                    <div className="vc-gallery-control">
                        <ManaDatePicker
                            key={`end-${dateResetKey}`}
                            value={endDateValue ?? null}
                            onChange={setEndDateValue}
                            granularity="day"
                            label="Date to"
                        />
                    </div>
                    <div className="vc-gallery-control">
                        <ManaButton
                            onClick={handleClearDates}
                            variant="secondary"
                            size="small"
                        >
                            Clear dates
                        </ManaButton>
                    </div>
                </div>
            </div>

            {totalRows > 0 ? (
                <div className="vc-channel-gallery-scroll" ref={scrollerRef}>
                    <ListScrollerThin
                        sections={[totalRows]}
                        sectionHeight={0}
                        rowHeight={gridLayout.rowHeight}
                        renderSection={() => null}
                        renderRow={renderRow}
                        renderFooter={renderFooter}
                        footerHeight={60}
                        paddingTop={PADDING}
                        paddingBottom={PADDING}
                        chunkSize={virtualChunkSize}
                    />
                </div>
            ) : (
                <div className="vc-channel-gallery-scroll" ref={scrollerRef}>
                    {renderFooter()}
                </div>
            )}
        </div>
    );
}
