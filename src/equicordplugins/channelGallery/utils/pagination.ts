/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Constants, RestAPI } from "@webpack/common";

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchMessagesChunk(args: {
    channelId: string;
    before: string | null;
    limit: number;
    signal?: AbortSignal;
}): Promise<any[]> {
    if (!args.channelId) return [];
    if (args.signal?.aborted) {
        const err = new Error("AbortError");
        err.name = "AbortError";
        throw err;
    }

    const timeout = setTimeout(() => {
        // Timeout handled in catch block
    }, FETCH_TIMEOUT_MS);

    try {
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(args.channelId),
            query: {
                limit: args.limit,
                ...(args.before ? { before: args.before } : {})
            },
            retries: 1
        });

        clearTimeout(timeout);

        if (args.signal?.aborted) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }

        const body = res?.body ?? res;
        if (!Array.isArray(body)) {
            console.warn("RestAPI.get returned non-array body:", body);
            return [];
        }
        return body;
    } catch (e: unknown) {
        clearTimeout(timeout);
        if (args.signal?.aborted) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }
        if (e instanceof Error && (e.name === "AbortError" || e.message === "AbortError")) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }
        console.error("fetchMessagesChunk error:", e);
        throw new Error("fetch_failed");
    }
}
