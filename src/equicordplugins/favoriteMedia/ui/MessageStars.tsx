/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { getPerTypeSettings } from "../settings";
import { MediaType } from "../types";
import { MediaFavButton } from "./components/MediaFavButton";

export function MessageStars({ items }: { items: Array<{ type: MediaType; url: string; name: string; }>; }) {
    const visible = items.filter(i => isStarVisible(i.type));
    if (!visible.length) return null;

    return (
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {visible.map((i, idx) => (
                <div key={`${i.type}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <MediaFavButton type={i.type} url={i.url} />
                    <div style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                        {i.name}
                    </div>
                </div>
            ))}
        </div>
    );
}

function isStarVisible(type: MediaType) {
    if (type === "gif") return false;
    return (getPerTypeSettings(type) as any).showStar !== false;
}
