/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

import type { ChatBubbleData } from "../types";

const STORAGE_KEY = "chatBubble_activeBubbles";

export async function loadBubbles(): Promise<ChatBubbleData[]> {
    const stored = await DataStore.get(STORAGE_KEY);
    return stored ?? [];
}

export async function saveBubbles(bubbles: ChatBubbleData[]): Promise<void> {
    await DataStore.set(STORAGE_KEY, bubbles);
}
