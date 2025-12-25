/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Forms, React } from "@webpack/common";

import { FavoriteMediaCacheDB } from "../cache";
import * as storage from "../storage";
import { MediaForType, MediaType } from "../types";
import { getUrlName } from "../utils";
import { MediaFavButton } from "./components/MediaFavButton";

type AnyItem = { type: MediaType; media: MediaForType<any>; };

function isProbablyVideoUrl(url: string) {
    const u = url.toLowerCase();
    const base = u.split("?")[0].split("#")[0];
    return (
        base.endsWith(".mp4")
        || base.endsWith(".webm")
        || base.endsWith(".mov")
        || base.endsWith(".m4v")
        || u.includes("format=mp4")
        || u.includes("format=webm")
    );
}

export function AllPicker({
    cache,
    maxPerPage,
    allowCaching,
    onSelectMedia,
}: {
    cache: FavoriteMediaCacheDB;
    maxPerPage: number;
    allowCaching: boolean;
    onSelectMedia: (type: MediaType, media: MediaForType<any>) => void;
}) {
    const [rev, forceUpdate] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => storage.subscribe(() => forceUpdate()), []);

    const [page, setPage] = React.useState(1);

    const items = React.useMemo(() => {
        const types: MediaType[] = ["gif", "image", "video", "audio", "file"];
        const all: AnyItem[] = [];
        for (const t of types) {
            try {
                const td = storage.getTypeData(t);
                for (const m of td.medias as any[]) {
                    all.push({ type: t, media: m });
                }
            } catch { }
        }
        return all;
    }, [rev]);

    const pageSize = Math.max(1, maxPerPage);
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const pageItems = React.useMemo(() => {
        const start = (page - 1) * pageSize;
        return items.slice(start, start + pageSize);
    }, [items, page, pageSize]);

    React.useEffect(() => {
        setPage(1);
    }, [rev]);

    React.useEffect(() => {
        setPage(p => Math.min(Math.max(1, p), totalPages));
    }, [totalPages]);

    return (
        <div className="fm-picker">
            <div className="fm-filterRow">
                <div className="fm-page">
                    <button
                        className="fm-inlineBtn"
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Prev
                    </button>
                    <Forms.FormText className="fm-pageText">{page}/{totalPages}</Forms.FormText>
                    <button
                        className="fm-inlineBtn"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        Next
                    </button>
                </div>
            </div>

            <div className="fm-grid">
                {pageItems.length === 0 ? (
                    <div className="fm-empty">
                        <Forms.FormText>No favorites yet.</Forms.FormText>
                    </div>
                ) : (
                    pageItems.map(({ type, media }) => (
                        <AllMediaCard
                            key={`${type}:${media.url}`}
                            type={type}
                            media={media}
                            cache={cache}
                            allowCaching={allowCaching}
                            onSelect={() => onSelectMedia(type, media)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function AllMediaCard({
    type,
    media,
    cache,
    allowCaching,
    onSelect,
}: {
    type: MediaType;
    media: MediaForType<any>;
    cache: FavoriteMediaCacheDB;
    allowCaching: boolean;
    onSelect: () => void;
}) {
    const candidate = type === "gif" ? ((media as any).src ?? media.url) : ((media as any).poster ?? (media as any).src ?? media.url);
    const [previewUrl, setPreviewUrl] = React.useState<string>(() => (allowCaching ? cache.getObjectUrl(candidate) : undefined) ?? candidate);
    const renderVideo = type === "video" || (type === "gif" && isProbablyVideoUrl(candidate));

    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (!allowCaching) {
                setPreviewUrl(candidate);
                return;
            }
            const existing = cache.getObjectUrl(candidate);
            if (existing) {
                setPreviewUrl(existing);
                return;
            }
            const bytes = await cache.get(candidate);
            if (!bytes) {
                setPreviewUrl(candidate);
                return;
            }
            const obj = await cache.ensureObjectUrl(candidate, bytes);
            if (!cancelled) setPreviewUrl(obj);
        })();
        return () => { cancelled = true; };
    }, [candidate, cache, allowCaching]);

    return (
        <div className="fm-card fm-media" onClick={onSelect}>
            <div className="fm-mediaPreview">
                {type === "audio" ? (
                    <audio controls preload="none" src={previewUrl} style={{ width: "100%" }} />
                ) : renderVideo ? (
                    <video
                        src={previewUrl}
                        poster={type === "video" ? (media as any).poster : undefined}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="fm-thumbVideo"
                    />
                ) : type === "gif" || type === "image" ? (
                    <img src={previewUrl} className="fm-thumbImg" />
                ) : (
                    <div className="fm-file">
                        <Forms.FormText>{media.name}</Forms.FormText>
                    </div>
                )}
                <div className="fm-mediaOverlay">
                    <MediaFavButton type={type} url={media.url} mode="picker" />
                </div>
            </div>
            <div className="fm-cardTitle">{media.name ?? getUrlName(media.url)}</div>
        </div>
    );
}
