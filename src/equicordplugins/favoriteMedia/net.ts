/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI } from "@webpack/common";

export async function refreshUrls(urls: string[]) {
    const CHUNK_SIZE = 50;
    const ret: Array<{ original: string; refreshed?: string; }> = [];

    for (let i = 0; i < Math.ceil(urls.length / CHUNK_SIZE); i++) {
        const chunkUrls = urls.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        const response = await RestAPI.post({
            url: "/attachments/refresh-urls",
            body: { attachment_urls: chunkUrls },
        }).catch(() => null);

        if (response?.ok && response.body?.refreshed_urls) ret.push(...response.body.refreshed_urls);

        await new Promise(r => setTimeout(r, 500));
    }

    return ret;
}

