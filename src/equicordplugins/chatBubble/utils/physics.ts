/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BubblePosition, BubbleVelocity } from "../types";

export function calculateVelocity(
    prevPos: BubblePosition,
    currentPos: BubblePosition,
    deltaTime: number
): BubbleVelocity {
    return {
        vx: (currentPos.x - prevPos.x) / deltaTime,
        vy: (currentPos.y - prevPos.y) / deltaTime
    };
}
