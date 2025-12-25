/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { EquicordDevs } from "@utils/constants";
import definePlugin, { IconComponent } from "@utils/types";
import { ChannelStore, React, showToast, Toasts } from "@webpack/common";

import { extractMediaCandidatesFromMessage, guessTypeFromAttachment } from "./mediaExtract";
import { createContextMenuPatches, onGifPickerRenderContent, patches, sendOrInsertMedia } from "./patches";
import { getPerTypeSettings, settings } from "./settings";
import { cacheDb } from "./singletons";
import * as storage from "./storage";
import { MediaForType, MediaType } from "./types";
import { MediaFavButton } from "./ui/components/MediaFavButton";
import { favoriteFromUrl } from "./ui/helpers/favoriteFromUrl";
import { UnifiedPickerPanel } from "./ui/UnifiedPicker";

const StarButtonIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" width={width} height={height} fill="currentColor" className={className}>
        <path d="M10.81 2.86c.38-1.15 2-1.15 2.38 0l1.89 5.83h6.12c1.2 0 1.71 1.54.73 2.25l-4.95 3.6 1.9 5.82a1.25 1.25 0 0 1-1.93 1.4L12 18.16l-4.95 3.6c-.98.7-2.3-.25-1.92-1.4l1.89-5.82-4.95-3.6a1.25 1.25 0 0 1 .73-2.25h6.12l1.9-5.83Z" />
    </svg>
);

export default definePlugin({
    name: "FavoriteMedia",
    description: "Allows to favorite GIFs, images, videos, audios and files.",
    authors: [EquicordDevs.neoarz],
    settings,

    patches: patches as any,
    contextMenus: createContextMenuPatches(),

    onGifPickerRenderContent,

    messagePopoverButton: {
        icon: StarButtonIcon,
        render: message => {
            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return null;

            const candidates = extractMediaCandidatesFromMessage(message);
            if (!candidates.length) return null;

            // Respect per-type `showStar` for the message hover button.
            const visible = candidates.filter(c => (getPerTypeSettings(c.type) as any).showStar !== false);
            if (!visible.length) return null;

            // Requested: avoid the multi-select menu; hide this hover button on multi-media messages.
            if (visible.length !== 1) return null;

            return {
                label: "Favorite Media",
                icon: StarButtonIcon,
                message,
                channel,
                onClick: async e => {
                    // If there's exactly one media in this message, toggle instantly (no submenu).
                    e.preventDefault?.();
                    e.stopPropagation?.();

                    const c = visible[0];
                    await storage.ensureLoaded();
                    const fav = storage.isFavorited(c.type, c.url);
                    if (fav) {
                        await storage.unfavorite(c.type, c.url);
                        showToast("Removed from favorites.", Toasts.Type.SUCCESS);
                    } else {
                        await favoriteFromUrl(c.type, c.url, c.extra as any);
                        showToast("Added to favorites.", Toasts.Type.SUCCESS);
                    }
                },
            };
        }
    },

    async start() {
        await storage.ensureLoaded();
    },

    favoriteMediaExpressionPickerComponent(props: any) {
        const channel = props?.channel;
        const closePopout = props?.closePopout ?? (() => { });

        if (!channel) return null;

        return (
            <div className="fm-expRoot">
                <div className="fm-expScroll">
                    <UnifiedPickerPanel
                        cache={cacheDb}
                        initialType="all"
                        onRequestClose={closePopout}
                        onSelectMedia={(t, media: MediaForType<any>) => {
                            void sendOrInsertMedia(channel, media, getPerTypeSettings(t));
                            if (getPerTypeSettings(t).alwaysSendInstantly) closePopout();
                        }}
                    />
                </div>
            </div>
        );
    },

    wrapMediaRender(message: any, rendered: any, kind?: "Attachments" | "Embeds") {
        try {
            if (!rendered) return rendered;
            return decorateMediaTree(rendered);
        } catch {
            return rendered;
        }
    },

    stop() {
        cacheDb.revokeAllObjectUrls();
    }
});

function decorateMediaTree(node: any): any {
    if (node == null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(decorateMediaTree);
    if (!React.isValidElement(node)) return node;

    // Avoid wrapping our own button or already-decorated wrappers
    if ((node.props as any)?.["data-fm-decorated"]) return node;
    if ((node.type as any) === MediaFavButton) return node;

    const info = tryGetMediaInfoFromElement(node);
    // If this element already maps to a concrete media, do not recurse further to avoid double overlays.
    const cloned = info ? node : (() => {
        const children = (node.props as any)?.children;
        const decoratedChildren = children != null ? decorateMediaTree(children) : children;
        return decoratedChildren !== children
            ? React.cloneElement(node as any, { children: decoratedChildren })
            : node;
    })();

    if (!info) return cloned;

    const per: any = getPerTypeSettings(info.type);
    if (per?.showStar === false) return cloned;

    return (
        <div
            data-fm-decorated
            style={{
                position: "relative",
                maxWidth: "100%",
            }}
        >
            {cloned}
            <div style={{ position: "absolute", top: 6, right: 6, zIndex: 1000, pointerEvents: "auto" }}>
                <MediaFavButton type={info.type} url={info.url} />
            </div>
        </div>
    );
}

function tryGetMediaInfoFromElement(el: any): { type: MediaType; url: string; } | null {
    const p = el?.props;
    if (!p) return null;

    // Attachment-like prop shapes
    const att = p.attachment ?? p.item?.originalItem ?? p.item ?? null;
    if (att?.url) {
        const type = guessTypeFromAttachment(att);
        return { type, url: att.url };
    }

    return null;
}
