/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

export async function fetchMedia(_event: IpcMainInvokeEvent, url: string) {
    try {
        if (!url) return null;
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        if (!data.length) return null;
        return {
            data,
            contentType: res.headers.get("content-type") ?? ""
        };
    } catch {
        return null;
    }
}

export function gifCaptionerUniqueIdThingyIdkMan() {}
