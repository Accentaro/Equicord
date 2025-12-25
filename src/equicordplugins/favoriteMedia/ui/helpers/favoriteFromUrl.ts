/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { favorite } from "../../storage";
import { MediaForType, MediaType } from "../../types";
import { getUrlExt, getUrlName, isLikelyGif } from "../../utils";

async function getMediaDimensions(url: string): Promise<{ width: number; height: number; } | null> {
    return await new Promise(res => {
        const img = new Image();
        img.onload = () => res({ width: img.width, height: img.height });
        img.onerror = () => res(null);
        img.src = url;
    });
}

export async function favoriteFromUrl(type: MediaType, url: string, extra?: Partial<MediaForType<any>>) {
    const name = getUrlName(url);

    const media = await (async (): Promise<any> => {
        switch (type) {
            case "gif": {
                const dims = await getMediaDimensions(url);
                const width = dims?.width ?? 200;
                const height = dims?.height ?? 200;
                return { url, src: url, width, height, name };
            }
            case "image": {
                const dims = await getMediaDimensions(url);
                const width = dims?.width ?? 200;
                const height = dims?.height ?? 200;
                return { url, width, height, name };
            }
            case "video": {
                return { url, poster: undefined, width: 200, height: 200, name };
            }
            case "audio": {
                return { url, ext: getUrlExt(url, "audio"), name };
            }
            case "file": {
                return { url, name };
            }
        }
    })();

    if (type === "image" && isLikelyGif(url)) {
        await favorite("gif", { url, src: url, width: media.width, height: media.height, name, ...extra } as any);
        return;
    }

    await favorite(type as any, { ...media, ...extra } as any);
}

