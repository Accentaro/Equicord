/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "./Logger";

const logger = new Logger("Performance", "#8aadf4");
const perfTimers = new Map<string, number>();
const MAX_PERF_TIMERS = 100;

/**
 * Start a performance timer with the given name.
 * Automatically cleans up old timers if the map gets too large.
 */
export function perfStart(name: string): void {
    // Clean up old timers if map gets too large
    if (perfTimers.size >= MAX_PERF_TIMERS) {
        const firstKey = perfTimers.keys().next().value;
        if (firstKey) perfTimers.delete(firstKey);
    }
    perfTimers.set(name, performance.now());
}

/**
 * End a performance timer and log the duration.
 * Returns silently if the timer was not started.
 */
export function perfEnd(name: string): void {
    const start = perfTimers.get(name);
    if (start === undefined) return;
    perfTimers.delete(name);
    const duration = performance.now() - start;
    logger.debug(`[perf] ${name} (${duration.toFixed(2)} ms)`);
}
