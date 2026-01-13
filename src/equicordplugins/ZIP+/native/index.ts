/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

export async function fetchAttachment(_event: IpcMainInvokeEvent, url: string): Promise<Uint8Array | null> {
    try {
        if (!url) return null;

        const res = await fetch(url);
        if (!res.ok) {
            console.error("ZIP+: native fetch failed", url, res.status, res.statusText);
            return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    } catch (error: any) {
        console.error("ZIP+: native fetch error", error);
        return null;
    }
}

export function zipPreviewUniqueIdThingyIdkMan() { }
