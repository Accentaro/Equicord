/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

export default definePlugin({
    name: "StreamEnhancements",
    description: "Adds more streaming options like higher framerates, resolutions.",
    authors: [EquicordDevs.Prism],

    patches: [
        {
            find: "ApplicationStreamFPS:()=>",
            replacement: {
                match: /,guildPremiumTier:\i\.\i\.TIER_\d/g,
                replace: ""
            }
        },
        {
            find: "canStreamQuality:",
            replacement: {
                match: /(?<=canStreamQuality:)\i/,
                replace: "()=>true"
            }
        },
        {
            find: "canStreamWithSettings",
            replacement: {
                match: /allowAutoQuality;.{0,150}return!1/,
                replace: "allowAutoQuality;return!0"
            }
        },
        {
            find: "navId:\"stream-options\"",
            replacement: [
                {
                    match: /(\[v\.ws\.FPS_15,v\.ws\.FPS_30,v\.ws\.FPS_60\])/,
                    replace: "$self.patchFPSArray($1)"
                },
                {
                    match: /(C\.map\(e=>)/,
                    replace: "$self.patchFPSArray(C).map(e=>"
                },
                {
                    match: /(O=\[)(\{value:v\.LY\.RESOLUTION_720[^\}]*\},\{value:v\.LY\.RESOLUTION_1080[^\}]*\},\{value:v\.LY\.RESOLUTION_1440[^\}]*\},\{value:v\.LY\.RESOLUTION_SOURCE[^\}]*\})(\])/,
                    replace: "O=$self.patchResolutionArray([$2])"
                }
            ]
        }
    ],

    patchFPSArray(fpsArray: any[]) {
        const newFps = Array.isArray(fpsArray) ? [...fpsArray] : [];
        [90, 120, 144, 240, 360, 420].forEach(fps => {
            if (!newFps.includes(fps)) newFps.push(fps);
        });
        return newFps;
    },

    patchResolutionArray(resArray: any[]) {
        const isObjectArray = Array.isArray(resArray) && resArray.length > 0 && typeof resArray[0] === "object" && resArray[0].value !== undefined;
        const newRes = [...resArray];
        const extraRes = [480, 1800, 2160, 2880];

        extraRes.forEach(res => {
            const exists = newRes.some((r: any) => {
                const rValue = r.value ?? r;
                return typeof rValue === "number" && rValue === res;
            });
            if (!exists) {
                const template = isObjectArray ? newRes[0] : null;
                const newItem = isObjectArray ? { value: res, canUse: template?.canUse || (() => true) } : res;
                if (res === 480) {
                    newRes.unshift(newItem);
                } else {
                    const sourceIndex = newRes.findIndex((r: any) => (r.value ?? r) === 0);
                    newRes.splice(sourceIndex !== -1 ? sourceIndex : newRes.length, 0, newItem);
                }
            }
        });
        return newRes;
    },

    contextMenus: {
        "stream-options": children => {
            children.push(
                <Menu.MenuSeparator />,
                <Menu.MenuItem
                    id="stream-enhancements-info"
                    label="Enhanced by StreamEnhancements"
                    disabled={true}
                />
            );
        }
    }
});
