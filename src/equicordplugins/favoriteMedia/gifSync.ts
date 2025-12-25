/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserSettingsActionCreators } from "@webpack/common";

import { GifMedia } from "./types";

type FavoriteGifs = { gifs: Record<string, any>; };

function getFrecency() {
    return UserSettingsActionCreators?.FrecencyUserSettingsActionCreators as any;
}

export async function syncDiscordGifFavorite(media: GifMedia) {
    const frecency = getFrecency();
    if (!frecency) return;

    const payload = {
        format: 2,
        url: media.url,
        src: media.src,
        order: (media as any).order,
        width: media.width,
        height: media.height,
    };

    // Best-effort: different Discord builds expose different helpers here.
    try {
        if (typeof frecency.favorite === "function") {
            frecency.favorite(payload);
            return;
        }
    } catch { }

    try {
        if (typeof frecency.updateAsync === "function") {
            await frecency.updateAsync("favoriteGifs", (fav: FavoriteGifs) => {
                fav ??= { gifs: {} };
                fav.gifs ??= {};
                fav.gifs[media.url] = payload;
                return fav;
            });
            return;
        }
    } catch { }
}

export async function syncDiscordGifUnfavorite(url: string) {
    const frecency = getFrecency();
    if (!frecency) return;

    try {
        if (typeof frecency.unfavorite === "function") {
            frecency.unfavorite(url);
            return;
        }
    } catch { }

    try {
        if (typeof frecency.updateAsync === "function") {
            await frecency.updateAsync("favoriteGifs", (fav: FavoriteGifs) => {
                if (!fav?.gifs) return fav;
                delete fav.gifs[url];
                return fav;
            });
        }
    } catch { }
}

