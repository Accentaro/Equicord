/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkSameUrl } from "./utils";

export class FavoriteMediaCacheDB {
    static DB_NAME = "FavoriteMedia";
    static STORE_NAME = "FMCache";
    static VERSION = 4;

    private objectUrls = new Map<string, string>();

    private open() {
        const openRequest = indexedDB.open(FavoriteMediaCacheDB.DB_NAME, FavoriteMediaCacheDB.VERSION);
        return new Promise<IDBDatabase>((resolve, reject) => {
            openRequest.onerror = () => reject(new Error(`Error loading database: ${FavoriteMediaCacheDB.DB_NAME}`));
            openRequest.onsuccess = () => resolve(openRequest.result);
            openRequest.onupgradeneeded = () => {
                try {
                    openRequest.result.createObjectStore(FavoriteMediaCacheDB.STORE_NAME);
                } catch {
                    // store exists
                }
            };
        });
    }

    async get(key: string) {
        const db = await this.open();
        try {
            return await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
                const tx = db.transaction(FavoriteMediaCacheDB.STORE_NAME, "readonly");
                const store = tx.objectStore(FavoriteMediaCacheDB.STORE_NAME);
                const req = store.get(key);
                req.onerror = () => reject(req.error);
                req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
    }

    async getAllKeys() {
        const db = await this.open();
        try {
            return await new Promise<string[]>((resolve, reject) => {
                const tx = db.transaction(FavoriteMediaCacheDB.STORE_NAME, "readonly");
                const store = tx.objectStore(FavoriteMediaCacheDB.STORE_NAME);
                const req = store.getAllKeys();
                req.onerror = () => reject(req.error);
                req.onsuccess = () => resolve(req.result as string[]);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
    }

    async getAllValues() {
        const db = await this.open();
        try {
            return await new Promise<ArrayBuffer[]>((resolve, reject) => {
                const tx = db.transaction(FavoriteMediaCacheDB.STORE_NAME, "readonly");
                const store = tx.objectStore(FavoriteMediaCacheDB.STORE_NAME);
                const req = store.getAll();
                req.onerror = () => reject(req.error);
                req.onsuccess = () => resolve(req.result as ArrayBuffer[]);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
    }

    async set(key: string, value: ArrayBuffer) {
        const db = await this.open();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(FavoriteMediaCacheDB.STORE_NAME, "readwrite");
                const store = tx.objectStore(FavoriteMediaCacheDB.STORE_NAME);
                store.put(value, key);
                tx.onabort = () => reject(tx.error);
                tx.oncomplete = () => resolve();
            });
        } finally {
            db.close();
        }
    }

    async delete(key: string) {
        const db = await this.open();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(FavoriteMediaCacheDB.STORE_NAME, "readwrite");
                const store = tx.objectStore(FavoriteMediaCacheDB.STORE_NAME);
                store.delete(key);
                tx.onabort = () => reject(tx.error);
                tx.oncomplete = () => resolve();
            });
        } finally {
            db.close();
        }
    }

    async clear() {
        await new Promise<void>((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase(FavoriteMediaCacheDB.DB_NAME);
            deleteRequest.onerror = () => reject(deleteRequest.error);
            deleteRequest.onsuccess = () => resolve();
        });
        this.revokeAllObjectUrls();
    }

    async ensureObjectUrl(url: string, bytes: ArrayBuffer) {
        const existing = this.objectUrls.get(url);
        if (existing) return existing;
        const blobUrl = URL.createObjectURL(new Blob([bytes]));
        this.objectUrls.set(url, blobUrl);
        return blobUrl;
    }

    getObjectUrl(url: string) {
        for (const [k, v] of this.objectUrls) {
            if (checkSameUrl(k, url)) return v;
        }
        return undefined;
    }

    revokeObjectUrl(url: string) {
        for (const [k, v] of this.objectUrls) {
            if (!checkSameUrl(k, url)) continue;
            URL.revokeObjectURL(v);
            this.objectUrls.delete(k);
        }
    }

    revokeAllObjectUrls() {
        for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
        this.objectUrls.clear();
    }

    static sizeOf(bytes: number) {
        if (bytes === 0) return "0.00 B";
        const e = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, e)).toFixed(2)} ${" KMGTP".charAt(e)}B`;
    }
}
