/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, Forms, React, showToast, Toasts } from "@webpack/common";

import { FavoriteMediaCacheDB } from "../cache";
import { cacheAllUrls } from "../cacheManager";
import { getTypeData } from "../storage";
import { MediaType } from "../types";

export function DatabasePanel({
    cache,
    onClose,
}: {
    cache: FavoriteMediaCacheDB;
    onClose: () => void;
}) {
    const [stats, setStats] = React.useState<{ count: number; bytes: number; } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [progress, setProgress] = React.useState<{ done: number; total: number; } | null>(null);

    const refreshStats = React.useCallback(() => {
        let cancelled = false;
        void (async () => {
            const values = await cache.getAllValues();
            const bytes = values.reduce((t, v) => t + (v?.byteLength ?? 0), 0);
            if (!cancelled) setStats({ count: values.length, bytes });
        })();
        return () => { cancelled = true; };
    }, [cache]);

    React.useEffect(() => refreshStats(), [refreshStats]);

    return (
        <div className="fm-modal">
            <Forms.FormTitle>Cache Database</Forms.FormTitle>
            <Forms.FormText>
                {stats ? `${stats.count} items, ${FavoriteMediaCacheDB.sizeOf(stats.bytes)}` : "Loading…"}
            </Forms.FormText>
            {progress && (
                <Forms.FormText>
                    Caching… {progress.done}/{progress.total}
                </Forms.FormText>
            )}
            <div className="fm-modalFooter">
                <Button
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            const types: MediaType[] = ["image", "video", "gif"];
                            const urls: string[] = [];
                            for (const type of types) {
                                const typeData = getTypeData(type);
                                for (const media of typeData.medias as any[]) {
                                    const thumb = type === "video" ? (media.poster ?? media.url) : type === "gif" ? (media.src ?? media.url) : media.url;
                                    if (thumb) urls.push(thumb);
                                }
                                for (const cat of typeData.categories) {
                                    if (cat.thumbnail) urls.push(cat.thumbnail);
                                }
                            }

                            setProgress({ done: 0, total: Math.max(1, urls.length) });
                            const res = await cacheAllUrls(cache, urls, (done, total) => setProgress({ done, total }));
                            showToast(`Cached ${res.done}/${res.total} items.`, Toasts.Type.SUCCESS);
                            setProgress(null);
                            refreshStats();
                        } catch {
                            setProgress(null);
                            showToast("Failed to cache medias.", Toasts.Type.FAILURE);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Cache All
                </Button>
                <Button
                    color={Button.Colors.RED}
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await cache.clear();
                            showToast("Database cleared.", Toasts.Type.SUCCESS);
                            setStats({ count: 0, bytes: 0 });
                        } catch {
                            showToast("Failed to clear database.", Toasts.Type.FAILURE);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Clear DB
                </Button>
                <Button
                    disabled={busy}
                    onClick={() => refreshStats()}
                >
                    Refresh Stats
                </Button>
                <Button onClick={onClose} disabled={busy}>Close</Button>
            </div>
        </div>
    );
}
