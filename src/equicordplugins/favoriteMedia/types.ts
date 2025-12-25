/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type MediaType = "gif" | "image" | "video" | "audio" | "file";

export interface Category {
    id: number;
    name: string;
    color: string;
    category_id?: number;
    thumbnail?: string;
}

export interface BaseMedia {
    url: string;
    name: string;
    category_id?: number;
    message?: string;
    source?: string;
    /**
     * When this favorite originates from a Discord sticker, we keep its id so selecting it
     * can send it as a sticker (preserving animation/format) rather than pasting an asset URL.
     */
    stickerId?: string;
    stickerFormatType?: number;
}

export interface GifMedia extends BaseMedia {
    src: string;
    width: number;
    height: number;
}

export interface ImageMedia extends BaseMedia {
    width: number;
    height: number;
}

export interface VideoMedia extends BaseMedia {
    poster?: string;
    width: number;
    height: number;
}

export interface AudioMedia extends BaseMedia {
    ext: string;
}

export type FileMedia = BaseMedia;

export type MediaForType<T extends MediaType> =
    T extends "gif" ? GifMedia :
        T extends "image" ? ImageMedia :
            T extends "video" ? VideoMedia :
                T extends "audio" ? AudioMedia :
                    T extends "file" ? FileMedia :
                        never;

export interface TypeData<T extends MediaType = MediaType> {
    medias: MediaForType<T>[];
    categories: Category[];
}

export interface StoredDataV1 {
    version: 1;
    gif: TypeData<"gif">;
    image: TypeData<"image">;
    video: TypeData<"video">;
    audio: TypeData<"audio">;
    file: TypeData<"file">;
}
