/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, Tooltip, showToast, Toasts } from "@webpack/common";

import { MediaType } from "../../types";
import { ensureLoaded, isFavorited, subscribe, unfavorite } from "../../storage";
import { settings } from "../../settings";
import { cacheDb } from "../../singletons";
import { cacheUrl, uncacheUrl } from "../../cacheManager";
import { favoriteFromUrl } from "../helpers/favoriteFromUrl";
import { StarIcon } from "./Icons";

export function MediaFavButton({ type, url, mode = "overlay" }: { type: MediaType; url: string; mode?: "overlay" | "picker"; }) {
    const [favorited, setFavorited] = React.useState(() => isFavorited(type, url));

    React.useEffect(() => {
        return subscribe(() => setFavorited(isFavorited(type, url)));
    }, [type, url]);

    const stopBase = (e: any) => {
        e.stopPropagation?.();
        e.nativeEvent?.stopImmediatePropagation?.();
    };

    const stopAggressive = (e: any) => {
        e.preventDefault?.();
        stopBase(e);
    };

    const stop = mode === "picker" ? stopBase : stopAggressive;

    return (
        <Tooltip text={favorited ? "Remove from favorites" : "Add to favorites"}>
            {({ onMouseEnter, onMouseLeave }) => (
                <button
                    type="button"
                    className="fm-favBtn"
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    onPointerDownCapture={mode === "picker" ? undefined : stop}
                    onMouseDownCapture={mode === "picker" ? undefined : stop}
                    onClickCapture={mode === "picker" ? undefined : stop}
                    onPointerUpCapture={mode === "picker" ? undefined : stop}
                    onMouseUpCapture={mode === "picker" ? undefined : stop}
                    onPointerDown={stop}
                    onMouseDown={stop}
                    onPointerUp={mode === "picker" ? undefined : stop}
                    onMouseUp={mode === "picker" ? undefined : stop}
                    onClick={async e => {
                        stop(e);
                        try {
                            await ensureLoaded();
                            const nowFav = isFavorited(type, url);
                            if (nowFav) {
                                await unfavorite(type, url);
                                if (settings.store.allowCaching) await uncacheUrl(cacheDb, url);
                                showToast("Removed from favorites.", Toasts.Type.SUCCESS);
                            } else {
                                await favoriteFromUrl(type, url);
                                if (settings.store.allowCaching) {
                                    try {
                                        await cacheUrl(cacheDb, url);
                                    } catch { }
                                }
                                showToast("Added to favorites.", Toasts.Type.SUCCESS);
                            }
                        } catch {
                            showToast("FavoriteMedia: action failed.", Toasts.Type.FAILURE);
                        }
                    }}
                >
                    <StarIcon filled={favorited} />
                </button>
            )}
        </Tooltip>
    );
}
