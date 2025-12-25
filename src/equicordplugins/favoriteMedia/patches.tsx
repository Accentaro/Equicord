/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { ChannelStore, ExpressionPickerStore, Menu, React, SelectedChannelStore, Toasts, UploadHandler, showToast } from "@webpack/common";

import { cacheUrl, uncacheUrl } from "./cacheManager";
import { getPerTypeSettings, settings } from "./settings";
import { cacheDb } from "./singletons";
import * as storage from "./storage";
import { MediaForType, MediaType } from "./types";
import { checkSameUrl, getUrlName, isLikelyGif } from "./utils";
import { favoriteFromUrl } from "./ui/helpers/favoriteFromUrl";
import { refreshUrls } from "./net";
import { UnifiedPickerPanel } from "./ui/UnifiedPicker";

/**
 * Patch points:
 * - Context menus: use `itemSrc` / `itemHref` / `attachment` props provided by Discord's context menu builder,
 *   avoiding DOM inspection and classname probing.
 * - GIF favorites replacement: patch the gif picker `renderContent()` to call into `onGifPickerRenderContent`.
 */

export function createContextMenuPatches(): Record<string, NavContextMenuPatchCallback> {
    const messagePatch: NavContextMenuPatchCallback = (children, props) => {
        const media = getMediaFromContextMenuProps(props);
        if (!media) return;

        const group = findGroupChildrenByChildId("copy-link", children)
            ?? findGroupChildrenByChildId("copy-native-link", children)
            ?? findGroupChildrenByChildId("copy-text", children)
            ?? children;

        if (group.some(c => c?.props?.id === "fm-root")) return;

        group.push(renderFavoriteMediaMenu(media));
    };

    const imageContextPatch: NavContextMenuPatchCallback = (children, props) => {
        const src = props?.src;
        if (!src) return;
        const already = (() => {
            try {
                return storage.isFavorited("image", src);
            } catch {
                return false;
            }
        })();
        children.unshift(
            <Menu.MenuItem
                id="fm-image-context"
                label={already ? "Remove from favorites" : "Add to favorites"}
                action={async () => {
                    await storage.ensureLoaded();
                    if (storage.isFavorited("image", src)) {
                        await storage.unfavorite("image", src);
                        if (settings.store.allowCaching) await uncacheUrl(cacheDb, src);
                    } else {
                        await favoriteFromUrl(isLikelyGif(src) ? "gif" : "image", src);
                        if (settings.store.allowCaching) {
                            try { await cacheUrl(cacheDb, src); } catch { }
                        }
                    }
                }}
            />
        );
    };

    const attachmentLinkPatch: NavContextMenuPatchCallback = (children, props) => {
        const url = props?.attachmentUrl;
        if (!url) return;
        children.unshift(renderFavoriteMediaMenu({ type: guessTypeFromUrl(url, props?.attachment) ?? "file", url }));
    };

    return {
        "message": messagePatch,
        "image-context": imageContextPatch,
        "attachment-link-context": attachmentLinkPatch,
    };
}

function renderFavoriteMediaMenu(media: { type: MediaType; url: string; extra?: Partial<MediaForType<any>>; }) {
    const isFav = storage.isFavorited(media.type, media.url);
    let categories: any[] = [];
    let categoryId: number | undefined;
    try {
        const typeData = storage.getTypeData(media.type);
        const entry = typeData.medias.find(m => checkSameUrl(m.url, media.url)) as any | undefined;
        categoryId = entry?.category_id as number | undefined;
        categories = typeData.categories;
    } catch {
        categories = [];
        categoryId = undefined;
    }
    const currentCategoryName = categoryId != null ? categories.find(c => c.id === categoryId)?.name : undefined;

    const doFavorite = async () => {
        await storage.ensureLoaded();
        await favoriteFromUrl(media.type, media.url, media.extra as any);
        if (settings.store.allowCaching) {
            try { await cacheUrl(cacheDb, media.url); } catch { }
        }
        showToast("Added to favorites.", Toasts.Type.SUCCESS);
    };

    const doUnfavorite = async () => {
        await storage.ensureLoaded();
        await storage.unfavorite(media.type, media.url);
        if (settings.store.allowCaching) await uncacheUrl(cacheDb, media.url);
        showToast("Removed from favorites.", Toasts.Type.SUCCESS);
    };

    return (
        <Menu.MenuItem id="fm-root" label="FavoriteMedia">
            <Menu.MenuItem
                id="fm-toggle-fav"
                label={isFav ? "Remove from favorites" : "Add to favorites"}
                action={isFav ? doUnfavorite : doFavorite}
            />

            {categories.length > 0 && (
                <Menu.MenuItem
                    id="fm-categories"
                    label={isFav ? (categoryId != null ? "Move to" : "Add to") : "Add to"}
                >
                    {isFav && categoryId != null && (
                        <>
                            <Menu.MenuItem
                                id="fm-remove-from-category"
                                label={`Remove from (${currentCategoryName ?? "Category"})`}
                                color="danger"
                                action={() => storage.setMediaCategory(media.type, media.url, undefined)}
                            />
                            <Menu.MenuSeparator />
                        </>
                    )}
                    {categories
                        .filter(c => c.id !== categoryId)
                        .map(c => (
                            <Menu.MenuItem
                                key={`fm-cat-${c.id}`}
                                id={`fm-cat-${c.id}`}
                                label={c.name}
                                action={async () => {
                                    if (!isFav) await doFavorite();
                                    await storage.setMediaCategory(media.type, media.url, c.id);
                                }}
                            />
                        ))}
                </Menu.MenuItem>
            )}

            {isFav && categoryId != null && (media.type === "gif" || media.type === "image" || media.type === "video") && (
                <Menu.MenuItem
                    id="fm-set-thumb"
                    label="Set as Category Thumbnail"
                    action={() => storage.setCategoryThumbnail(media.type, categoryId, media.url)}
                />
            )}

            <Menu.MenuSeparator />

            <Menu.MenuItem
                id="fm-download"
                label="Download"
                action={() => downloadOne(media)}
            />
        </Menu.MenuItem>
    );
}

function guessTypeFromUrl(url: string, attachment?: any): MediaType | null {
    const ct = attachment?.content_type as string | undefined;
    if (ct?.startsWith("image/")) return url.split("?")[0].endsWith(".gif") || ct === "image/gif" ? "gif" : "image";
    if (ct?.startsWith("video/")) return "video";
    if (ct?.startsWith("audio/")) return "audio";

    const lower = url.split("?")[0].toLowerCase();
    if (lower.endsWith(".gif")) return "gif";
    if (/\.(png|jpg|jpeg|webp|bmp|avif)$/.test(lower)) return "image";
    if (/\.(mp4|webm|mkv|mov)$/.test(lower)) return "video";
    if (/\.(mp3|ogg|wav|flac|m4a)$/.test(lower)) return "audio";
    return "file";
}

function getMediaFromContextMenuProps(props: any): { type: MediaType; url: string; extra?: Partial<MediaForType<any>>; } | null {
    const url = props?.itemHref ?? props?.itemSrc ?? props?.attachmentUrl ?? props?.attachment?.url;
    if (typeof url !== "string" || !url) return null;

    const attachment = props?.attachment;
    const type = guessTypeFromUrl(url, attachment);
    if (!type) return null;

    const extra: any = {};
    if ((type === "image" || type === "gif") && attachment?.width && attachment?.height) {
        extra.width = attachment.width;
        extra.height = attachment.height;
    }
    if (type === "gif") extra.src = attachment?.proxy_url ?? url;
    if (type === "file") extra.name = attachment?.filename ?? getUrlName(url);

    if (type === "image" && isLikelyGif(url)) return { type: "gif", url, extra };
    return { type, url, extra };
}

async function downloadOne(media: { type: MediaType; url: string; }) {
    try {
        const res = await fetch(media.url);
        const ab = await res.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const name = getUrlName(media.url).replaceAll(" ", "_");
        const ext = media.type === "gif" ? ".gif" : "";
        await DiscordNative.fileManager.saveWithDialog(bytes, `${name}${ext}`);
        showToast("Downloaded.", Toasts.Type.SUCCESS);
    } catch {
        showToast("Failed to download.", Toasts.Type.FAILURE);
    }
}

export async function sendOrInsertMedia(channel: any, media: MediaForType<any>, settings: { alwaysSendInstantly: boolean; alwaysUploadFile: boolean; }) {
    if (!channel?.id) return;

    // Stickers need to be sent as stickers to preserve animation/format; pasting asset URLs can lose animation.
    const stickerId = (media as any)?.stickerId as string | undefined;
    if (stickerId) {
        try {
            const { sendMessage } = await import("@utils/discord");
            await sendMessage(channel.id, { content: "" }, true, { stickerIds: [stickerId] });
        } catch {
            try {
                const { insertTextIntoChatInputBox } = await import("@utils/discord");
                insertTextIntoChatInputBox(media.url);
            } catch {
                showToast("Failed to send sticker.", Toasts.Type.FAILURE);
            }
        }
        return;
    }

    if (settings.alwaysUploadFile) {
        try {
            const res = await fetch(media.url);
            const ab = await res.arrayBuffer();
            const ext = media.url.split("?")[0].split(".").pop();
            const fileName = (media.name || getUrlName(media.url)).replaceAll("\u0000", "") + (ext ? `.${ext}` : "");
            const file = new File([ab], fileName);
            UploadHandler.promptToUpload([file], channel, 0);
        } catch {
            showToast("Failed to upload media.", Toasts.Type.FAILURE);
        }
        return;
    }

    if (settings.alwaysSendInstantly) {
        // Prefer Discord's send pipeline when available; fallback to insert for safety.
        try {
            const { sendMessage } = await import("@utils/discord");
            await sendMessage(channel.id, { content: media.url });
        } catch {
            showToast("Failed to send message.", Toasts.Type.FAILURE);
        }
    } else {
        try {
            const { insertTextIntoChatInputBox } = await import("@utils/discord");
            insertTextIntoChatInputBox(media.url);
        } catch {
            showToast("Failed to insert into chat.", Toasts.Type.FAILURE);
        }
    }
}

export const patches = [
    {
        find: "renderHeaderContent()",
        replacement: [
            {
                match: /(renderContent\(\){)(.{1,50}resultItems)/,
                replace: "$1$self.onGifPickerRenderContent(this);$2"
            },
        ]
    },
    {
        // Add a new "Favorites" tab next to Emoji/GIFs/Stickers in the expression picker.
        // This uses the same injection approach as `MoreStickers` to avoid DOM/classname probing.
        find: "#{intl::EXPRESSION_PICKER_CATEGORIES_A11Y_LABEL}",
        replacement: [
            {
                match: /(?<=(\i)\?(\(.{0,15}\))\((\i),\{.{0,150}(\i)===\i\.\i\.STICKER,.{0,150}children:(.{0,30}\.stickersNavItem,children:.{0,25})\}\)\}\):null)/,
                replace: ',vcFavTab=$1?$2($3,{id:"favorite-media-picker-tab","aria-controls":"favorite-media-picker-tab-panel","aria-selected":$4==="favoriteMedia",isActive:$4==="favoriteMedia",autoFocus:true,viewType:"favoriteMedia",children:$5+"★"})}):null'
            },
            {
                match: /children:\[\i,\i(?=.{0,5}\}\))/g,
                replace: "$&,vcFavTab"
            },
            {
                match: /:null,((.{1,200})===.{1,30}\.STICKER&&\w+\?(\([^()]{1,10}\)).{1,15}?(\{.*?,onSelectSticker:.*?\})\):null)/,
                replace: ':null,$2==="favoriteMedia"?$3($self.favoriteMediaExpressionPickerComponent,$4):null,$1'
            }
        ]
    },
    {
        // Inject our star buttons next to message attachments/embeds renders (no DOM, only React output wrapping).
        find: "this.renderAttachments(",
        replacement: {
            match: /this\.render(Attachments|Embeds)\((\i)\)/g,
            replace: (m, kind, msg) => `$self.wrapMediaRender(${msg},${m},"${kind}")`
        }
    },
] as const;

export function onGifPickerRenderContent(instance: any) {
    if (instance?.state?.resultType !== "Favorites") return;
    if (!Array.isArray(instance?.props?.data)) return;

    const favorites = [...instance.props.data].reverse();
    const stored = storage.getTypeData("gif");
    const merged: any[] = [];

    for (const fav of favorites) {
        const url = fav?.url;
        const src = fav?.src ?? fav?.gifSrc ?? fav?.imageSrc;
        if (!url || !src) continue;

        const existing = stored.medias.find(g => checkSameUrl(g.url, url));
        merged.push(existing ?? {
            url,
            src,
            width: fav.width ?? 200,
            height: fav.height ?? 200,
            name: getUrlName(url),
        });
    }

    stored.medias = merged;
    void storage.save();

    // Replace the Discord "Favorites" GIF view with our picker.
    instance.props.renderResults = () => (
        <UnifiedPickerPanel
            cache={cacheDb}
            initialType="all"
            onRequestClose={() => ExpressionPickerStore.closeExpressionPicker()}
            onSelectMedia={(t, media) => {
                const channelId = SelectedChannelStore.getChannelId();
                const channel = channelId ? ChannelStore.getChannel(channelId) : null;
                if (!channel) return;
                void sendOrInsertMedia(channel, media, getPerTypeSettings(t));
                if (getPerTypeSettings(t).alwaysSendInstantly) ExpressionPickerStore.closeExpressionPicker();
            }}
        />
    );
}
