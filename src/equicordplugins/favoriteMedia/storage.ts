/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { syncDiscordGifFavorite, syncDiscordGifUnfavorite } from "./gifSync";
import { MediaForType, MediaType, StoredDataV1, TypeData } from "./types";
import { checkSameUrl } from "./utils";

const DATASTORE_KEY = "FavoriteMedia_data_v1";

type Listener = () => void;

let data: StoredDataV1 | null = null;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
    for (const l of listeners) l();
}

export function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function defaultData(): StoredDataV1 {
    return {
        version: 1,
        gif: { medias: [], categories: [] },
        image: { medias: [], categories: [] },
        video: { medias: [], categories: [] },
        audio: { medias: [], categories: [] },
        file: { medias: [], categories: [] },
    };
}

export async function ensureLoaded() {
    loadPromise ??= (async () => {
        const stored = await DataStore.get<StoredDataV1>(DATASTORE_KEY);
        data = stored?.version === 1 ? stored : defaultData();
        if (!stored) await DataStore.set(DATASTORE_KEY, data);
    })();
    return loadPromise;
}

function requireData() {
    if (!data) throw new Error("FavoriteMedia storage not loaded");
    return data;
}

export async function save() {
    await DataStore.set(DATASTORE_KEY, requireData());
    emit();
}

export function getTypeData<T extends MediaType>(type: T): TypeData<T> {
    const d = requireData();
    return d[type] as TypeData<T>;
}

export function isFavorited(type: MediaType, url: string) {
    const typeData = getTypeData(type);
    return typeData.medias.some(m => checkSameUrl(m.url, url));
}

export async function favorite<T extends MediaType>(type: T, media: MediaForType<T>) {
    const typeData = getTypeData(type);
    if (typeData.medias.some(m => checkSameUrl(m.url, media.url))) return;
    typeData.medias.push(media);
    await save();

    if (type === "gif") {
        try {
            await syncDiscordGifFavorite(media as any);
        } catch { }
    }
}

export async function unfavorite(type: MediaType, url: string) {
    const typeData = getTypeData(type);
    if (!typeData.medias.length) return;

    typeData.medias = typeData.medias.filter(m => !checkSameUrl(m.url, url)) as any;

    for (const c of typeData.categories) {
        if (c.thumbnail && checkSameUrl(c.thumbnail, url)) c.thumbnail = undefined;
    }

    await save();

    if (type === "gif") {
        try {
            await syncDiscordGifUnfavorite(url);
        } catch { }
    }
}

export function getNewCategoryId(type: MediaType) {
    const cats = getTypeData(type).categories;
    let max = 0;
    for (const c of cats) max = Math.max(max, c.id);
    return max + 1;
}

export function categoryHasSubcategories(type: MediaType, categoryId: number) {
    return getTypeData(type).categories.some(c => c.category_id === categoryId);
}

export async function createCategory(type: MediaType, values: { name: string; color: string; }, parentId?: number) {
    const typeData = getTypeData(type);
    const id = getNewCategoryId(type);
    typeData.categories.push({
        id,
        name: values.name,
        color: values.color,
        ...(parentId != null ? { category_id: parentId } : {}),
    });
    await save();
    return id;
}

export async function editCategory(type: MediaType, id: number, values: { name: string; color: string; }) {
    const typeData = getTypeData(type);
    const idx = typeData.categories.findIndex(c => c.id === id);
    if (idx === -1) return false;
    typeData.categories[idx] = { ...typeData.categories[idx], ...values };
    await save();
    return true;
}

export async function moveCategory(type: MediaType, id: number, parentId?: number) {
    const typeData = getTypeData(type);
    const idx = typeData.categories.findIndex(c => c.id === id);
    if (idx === -1) return false;
    const cat = typeData.categories[idx];
    if (parentId == null) delete cat.category_id;
    else cat.category_id = parentId;
    await save();
    return true;
}

export async function deleteCategory(type: MediaType, id: number, { deleteChildren }: { deleteChildren: boolean; }) {
    const typeData = getTypeData(type);
    const hasChildren = categoryHasSubcategories(type, id);
    if (hasChildren && !deleteChildren) return false;

    const idsToDelete = new Set<number>([id]);
    if (deleteChildren) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const c of typeData.categories) {
                if (c.category_id != null && idsToDelete.has(c.category_id) && !idsToDelete.has(c.id)) {
                    idsToDelete.add(c.id);
                    changed = true;
                }
            }
        }
    }

    typeData.categories = typeData.categories.filter(c => !idsToDelete.has(c.id));
    for (const m of typeData.medias as any[]) {
        if (m.category_id != null && idsToDelete.has(m.category_id)) delete m.category_id;
    }

    await save();
    return true;
}

export async function setCategoryThumbnail(type: MediaType, categoryId: number, url?: string) {
    const typeData = getTypeData(type);
    const idx = typeData.categories.findIndex(c => c.id === categoryId);
    if (idx === -1) return false;
    typeData.categories[idx].thumbnail = url;
    await save();
    return true;
}

export async function setMediaCategory(type: MediaType, url: string, categoryId?: number) {
    const typeData = getTypeData(type);
    const idx = typeData.medias.findIndex(m => checkSameUrl(m.url, url));
    if (idx === -1) return false;
    const media: any = typeData.medias[idx];
    if (categoryId == null) delete media.category_id;
    else media.category_id = categoryId;

    for (const c of typeData.categories) {
        if (c.thumbnail && checkSameUrl(c.thumbnail, url)) c.thumbnail = undefined;
    }

    await save();
    return true;
}
