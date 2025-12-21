/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";

function isAllowedHost(host: string) {
    return host === "cdn.discordapp.com" || host === "media.discordapp.net";
}

function requestFor(url: URL) {
    return url.protocol === "http:" ? httpRequest : httpsRequest;
}

export async function downloadBytes(_: IpcMainInvokeEvent, urls: string[], maxBytes: number, timeoutMs: number): Promise<Uint8Array> {
    const uniq = Array.from(new Set(urls)).filter(Boolean);
    if (!uniq.length) throw new Error("No URL");

    let lastErr: unknown = null;
    for (const urlStr of uniq) {
        try {
            const url = new URL(urlStr);
            if (!isAllowedHost(url.hostname)) throw new Error(`Host not allowed: ${url.hostname}`);
            return await downloadWithRedirects(url, maxBytes, timeoutMs, 3);
        } catch (e) {
            lastErr = e;
        }
    }

    throw (lastErr instanceof Error ? lastErr : new Error("Failed to download"));
}

function downloadWithRedirects(url: URL, maxBytes: number, timeoutMs: number, redirectsLeft: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const req = requestFor(url)(
            url,
            {
                method: "GET",
                headers: {
                    "User-Agent": `Electron ${process.versions.electron ?? ""} ~ Equicord`,
                    "Accept": "*/*",
                }
            },
            res => {
                const status = res.statusCode ?? 0;
                const loc = res.headers.location;

                if (status >= 300 && status < 400 && typeof loc === "string" && redirectsLeft > 0) {
                    res.resume();
                    try {
                        const next = new URL(loc, url);
                        if (!isAllowedHost(next.hostname)) {
                            reject(new Error(`Redirect host not allowed: ${next.hostname}`));
                            return;
                        }
                        resolve(downloadWithRedirects(next, maxBytes, timeoutMs, redirectsLeft - 1));
                    } catch (e) {
                        reject(e);
                    }
                    return;
                }

                if (status < 200 || status >= 300) {
                    res.resume();
                    reject(new Error(`HTTP ${status}`));
                    return;
                }

                const lenHeader = res.headers["content-length"];
                const contentLength = typeof lenHeader === "string" ? Number(lenHeader) : NaN;
                if (Number.isFinite(contentLength) && contentLength > maxBytes) {
                    res.resume();
                    reject(new Error("ZIP too large to preview"));
                    return;
                }

                const chunks: Buffer[] = [];
                let total = 0;

                res.on("data", (chunk: Buffer) => {
                    total += chunk.length;
                    if (total > maxBytes) {
                        res.destroy(new Error("ZIP too large to preview"));
                        return;
                    }
                    chunks.push(chunk);
                });

                res.on("end", () => {
                    const buf = Buffer.concat(chunks, total);
                    resolve(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
                });

                res.on("error", err => reject(err));
            }
        );

        req.on("error", err => reject(err));
        req.setTimeout(timeoutMs, () => req.destroy(new Error("Timeout")));
        req.end();
    });
}
