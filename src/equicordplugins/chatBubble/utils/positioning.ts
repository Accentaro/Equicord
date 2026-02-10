/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BubblePosition } from "../types";

export function getScreenBounds() {
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

export function isInTrashZone(
    position: BubblePosition,
    trashZoneY: number,
    magnetRadius: number
): boolean {
    const bounds = getScreenBounds();
    const centerX = bounds.width / 2;
    const distance = Math.sqrt(
        Math.pow(position.x - centerX, 2) +
        Math.pow(position.y - trashZoneY, 2)
    );
    return distance < magnetRadius;
}
