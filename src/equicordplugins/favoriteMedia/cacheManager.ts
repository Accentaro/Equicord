/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FavoriteMediaCacheDB } from "./cache";
import { refreshUrls } from "./net";

export async function cacheUrl(cache: FavoriteMediaCacheDB, url: string) {
    const existing = await cache.get(url);
    if (existing) {
        await cache.ensureObjectUrl(url, existing);
        return { ok: true as const, cached: false as const };
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const ab = await res.arrayBuffer();
    await cache.set(url, ab);
    await cache.ensureObjectUrl(url, ab);
    return { ok: true as const, cached: true as const };
}

export async function uncacheUrl(cache: FavoriteMediaCacheDB, url: string) {
    await cache.delete(url);
    cache.revokeObjectUrl(url);
}

export async function cacheAllUrls(cache: FavoriteMediaCacheDB, urls: string[], onProgress?: (done: number, total: number) => void) {
    const keys = new Set(await cache.getAllKeys());
    const toCache = urls.filter(u => u && !keys.has(u));
    if (!toCache.length) return { done: 0, total: 0 };

    const refreshed = await refreshUrls(toCache);
    let done = 0;

    for (const u of toCache) {
        const r = refreshed.find(x => x.original === u && x.refreshed);
        const fetchUrl = r?.refreshed ?? u;
        const res = await fetch(fetchUrl);
        if (!res.ok) {
            done++;
            onProgress?.(done, toCache.length);
            continue;
        }
        const ab = await res.arrayBuffer();
        await cache.set(u, ab);
        await cache.ensureObjectUrl(u, ab);
        done++;
        onProgress?.(done, toCache.length);
    }

    return { done, total: toCache.length };
}

