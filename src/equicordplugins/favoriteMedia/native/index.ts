/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import fs from "node:fs/promises";
import path from "node:path";

import { dialog, IpcMainInvokeEvent } from "electron";

// so we can filter the native helpers by this key
export function favoriteMediaUniqueIdThingyIdkMan() { }

export async function chooseDirectory(_event: IpcMainInvokeEvent, defaultPath?: string) {
    const res = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        defaultPath
    });
    const dir = res.filePaths[0];
    if (!dir) throw new Error("Invalid directory");
    return dir;
}

export async function ensureDir(_event: IpcMainInvokeEvent, dir: string) {
    await fs.mkdir(dir, { recursive: true });
}

export async function fileExists(_event: IpcMainInvokeEvent, filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function writeFile(_event: IpcMainInvokeEvent, filePath: string, content: Uint8Array) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
}

