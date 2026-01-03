/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { perfEnd, perfStart } from "@utils/performance";
import { Constants, RestAPI } from "@webpack/common";

const logger = new Logger("ChannelGallery", "#8aadf4");

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchMessagesChunk(args: {
    channelId: string;
    before: string | null;
    limit: number;
    signal?: AbortSignal;
}): Promise<any[]> {
    if (!args.channelId) return [];
    if (args.signal && args.signal.aborted) {
        const err = new Error("AbortError");
        err.name = "AbortError";
        throw err;
    }

    try {
        perfStart(`fetch-messages:${args.channelId}`);
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(args.channelId),
            query: {
                limit: args.limit,
                ...(args.before ? { before: args.before } : {})
            },
            retries: 1
        });
        perfEnd(`fetch-messages:${args.channelId}`);

        if (args.signal && args.signal.aborted) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }

        if (!res) return [];
        const body = res.body ?? res;
        if (!Array.isArray(body)) {
            return [];
        }
        return body;
    } catch (e: unknown) {
        if (args.signal && args.signal.aborted) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }
        logger.debug("[data] fetchMessagesChunk error", e);
        if (e instanceof Error && (e.name === "AbortError" || e.message === "AbortError")) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }
        throw new Error("fetch_failed");
    }
}
