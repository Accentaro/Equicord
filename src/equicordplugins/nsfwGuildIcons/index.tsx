/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import type { Guild } from "@vencord/discord-types";
import { Menu, React, useEffect, useStateFromStores } from "@webpack/common";

import { NsfwGuildIconsStore } from "./NsfwGuildIconsStore";

let requestApply: (() => void) | undefined;

function getRootsForGuildId(guildId: string): Element[] {
    const roots = new Set<Element>();

    try {
        // Restrict to server list items only (guilds nav). Other parts of the UI also link to /channels/<guildId>/...
        document.querySelectorAll(`[data-list-item-id^="guildsnav"][data-list-item-id*="${guildId}"]`).forEach(el => roots.add(el));
    } catch { /* ignore */ }

    try {
        // Fallback: anchor inside a guildsnav item
        document.querySelectorAll(`[data-list-item-id^="guildsnav"] a[href^="/channels/${guildId}"]`).forEach(el => roots.add(el));
    } catch { /* ignore */ }

    return Array.from(roots);
}

function getServerListItemRoot(el: Element): HTMLElement | null {
    // Never apply outside the server list.
    return (el.closest(`[data-list-item-id^="guildsnav"]`) ?? null) as HTMLElement | null;
}

function getIconTargets(itemRoot: Element): HTMLElement[] {
    const foreignObjects = itemRoot.querySelectorAll<HTMLElement>("svg foreignObject");
    if (foreignObjects.length) {
        const inner = itemRoot.querySelectorAll<HTMLElement>("svg foreignObject img, svg foreignObject video, svg foreignObject canvas");
        return [...Array.from(foreignObjects), ...Array.from(inner)];
    }

    const acronyms = itemRoot.querySelectorAll<HTMLElement>("[class*='acronym']");
    if (acronyms.length) return Array.from(acronyms);

    const imgs = itemRoot.querySelectorAll<HTMLElement>("img");
    if (imgs.length) return Array.from(imgs);

    const svgs = itemRoot.querySelectorAll<HTMLElement>("svg");
    if (svgs.length) return Array.from(svgs);

    const bg = itemRoot.querySelectorAll<HTMLElement>("[style*='background-image']");
    if (bg.length) return Array.from(bg);

    return [];
}

function applyStyles(targets: HTMLElement[], blurred: boolean) {
    const { blurAmount } = settings.store;

    for (const el of targets) {
        if (blurred) {
            el.dataset.vcNsfwGuildIcon = "1";
            el.style.filter = `blur(${blurAmount}px)`;
            el.style.transform = "scale(1.08)";
            el.style.transformOrigin = "center";
            el.style.willChange = "filter, transform";
            el.style.transition = "filter 0.2s ease, transform 0.2s ease";
        } else if (el.dataset.vcNsfwGuildIcon === "1") {
            delete el.dataset.vcNsfwGuildIcon;
            el.style.filter = "";
            el.style.transform = "";
            el.style.transformOrigin = "";
            el.style.willChange = "";
            el.style.transition = "";
        }
    }
}

function NsfwGuildIconsApplier() {
    const markedGuildIds = useStateFromStores(
        [NsfwGuildIconsStore],
        () => Array.from(NsfwGuildIconsStore.guildIds).sort(),
        undefined,
        (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    );

    useEffect(() => {
        let raf = 0;
        const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const marked = new Set(markedGuildIds);

                document.querySelectorAll<HTMLElement>("[data-vc-nsfw-guild-id]").forEach(item => {
                    const id = item.dataset.vcNsfwGuildId!;
                    if (!marked.has(id)) {
                        delete item.dataset.vcNsfwGuildId;
                        const handlers = (item as any).__vcNsfwGuildIconsHoverHandlers;
                        if (handlers) {
                            item.removeEventListener("pointerenter", handlers.onEnter);
                            item.removeEventListener("pointerleave", handlers.onLeave);
                            delete (item as any).__vcNsfwGuildIconsHoverHandlers;
                        }
                        applyStyles(getIconTargets(item), false);
                    }
                });

                for (const guildId of marked) {
                    for (const el of getRootsForGuildId(guildId)) {
                        const item = getServerListItemRoot(el);
                        if (!item) continue;
                        item.dataset.vcNsfwGuildId = guildId;

                        const targets = getIconTargets(item);
                        const isHovered = item.dataset.vcNsfwGuildIconHovered === "1";
                        const shouldBlur = !(settings.store.revealOnHover && isHovered);
                        applyStyles(targets.length ? targets : [item], shouldBlur);

                        if (settings.store.revealOnHover) {
                            const existing = (item as any).__vcNsfwGuildIconsHoverHandlers;
                            if (!existing) {
                                const onEnter = () => {
                                    item.dataset.vcNsfwGuildIconHovered = "1";
                                    const hoverTargets = getIconTargets(item);
                                    applyStyles(hoverTargets.length ? hoverTargets : [item], false);
                                };
                                const onLeave = () => {
                                    delete item.dataset.vcNsfwGuildIconHovered;
                                    const leaveTargets = getIconTargets(item);
                                    applyStyles(leaveTargets.length ? leaveTargets : [item], true);
                                };
                                item.addEventListener("pointerenter", onEnter);
                                item.addEventListener("pointerleave", onLeave);
                                (item as any).__vcNsfwGuildIconsHoverHandlers = { onEnter, onLeave };
                            }
                        } else {
                            const existing = (item as any).__vcNsfwGuildIconsHoverHandlers;
                            if (existing) {
                                item.removeEventListener("pointerenter", existing.onEnter);
                                item.removeEventListener("pointerleave", existing.onLeave);
                                delete (item as any).__vcNsfwGuildIconsHoverHandlers;
                                delete item.dataset.vcNsfwGuildIconHovered;
                            }
                        }
                    }
                }
            });
        };

        requestApply = schedule;
        schedule();

        const observer = new MutationObserver(() => schedule());
        observer.observe(document.body, { subtree: true, childList: true });

        return () => {
            if (requestApply === schedule) requestApply = undefined;
            observer.disconnect();
            if (raf) cancelAnimationFrame(raf);

            document.querySelectorAll<HTMLElement>("[data-vc-nsfw-guild-id]").forEach(item => {
                delete item.dataset.vcNsfwGuildId;
                delete item.dataset.vcNsfwGuildIconHovered;
                const existing = (item as any).__vcNsfwGuildIconsHoverHandlers;
                if (existing) {
                    item.removeEventListener("pointerenter", existing.onEnter);
                    item.removeEventListener("pointerleave", existing.onLeave);
                    delete (item as any).__vcNsfwGuildIconsHoverHandlers;
                }
                applyStyles(getIconTargets(item), false);
            });
        };
    }, [markedGuildIds.join(",")]);

    return null;
}

const settings = definePluginSettings({
    blurAmount: {
        type: OptionType.SLIDER,
        description: "Blur amount (in pixels)",
        default: 1.5,
        markers: [0, 0.5, 1, 1.5, 2, 3, 4, 6],
        onChange: () => requestApply?.(),
    },
    revealOnHover: {
        type: OptionType.BOOLEAN,
        description: "Reveal marked guild icons on hover",
        default: false,
        onChange: () => requestApply?.(),
    },
});

const GuildContextPatch: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild?.id) return;

    const group = findGroupChildrenByChildId("privacy", children);
    const container = group ?? children;

    const isNsfw = NsfwGuildIconsStore.has(guild.id);

    container.push(
        <Menu.MenuItem
            id="vc-nsfw-guild-icon"
            label={isNsfw ? "Unmark NSFW" : "NSFW"}
            action={() => NsfwGuildIconsStore.toggle(guild.id)}
        />
    );
};

export default definePlugin({
    name: "NSFWGuildIcons",
    description: "Lets you mark guild icons as NSFW to blur/obfuscate them in the server list",
    authors: [EquicordDevs.bep],
    tags: ["guild", "server", "privacy", "streaming"],

    settings,

    dependencies: ["ServerListAPI"],

    contextMenus: {
        "guild-context": GuildContextPatch,
        "guild-header-popout": GuildContextPatch,
    },

    async start() {
        await NsfwGuildIconsStore.load();
        addServerListElement(ServerListRenderPosition.Above, NsfwGuildIconsApplier);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, NsfwGuildIconsApplier);
        NsfwGuildIconsStore.unload();
    },
});
