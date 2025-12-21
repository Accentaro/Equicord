/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { ChannelStore, DraftType, React, SelectedChannelStore, UploadHandler, useState } from "@webpack/common";
import { zipSync } from "fflate";

const logger = new Logger("AutoZipper");

const settings = definePluginSettings({
    extensions: {
        type: OptionType.STRING,
        description: "Comma-separated list of file extensions to auto-zip (e.g., .psd,.blend,.exe,.dmg)",
        default: ".psd,.blend,.exe,.dmg,.app,.apk,.iso",
        onChange: () => {
            extensionsToZip.clear();
            parseExtensions();
        }
    },
    enableZipPreview: {
        type: OptionType.BOOLEAN,
        description: "Enables showing a ZIP contents dropdown for .zip attachments in chat",
        default: false,
    }
});

const extensionsToZip = new Set<string>();

const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 200;
const FETCH_TIMEOUT_MS = 8000;

const zipContentsCache = new Map<string, string[]>();
const zipContentsInFlight = new Map<string, Promise<string[]>>();

const Native: PluginNative<typeof import("./native")> | null = IS_DISCORD_DESKTOP
    ? (VencordNative.pluginHelpers.AutoZipper as PluginNative<typeof import("./native")>)
    : null;

function parseExtensions() {
    extensionsToZip.clear();
    const exts = settings.store.extensions.split(",").map(ext => ext.trim().toLowerCase());
    exts.forEach(ext => {
        if (ext && !ext.startsWith(".")) {
            extensionsToZip.add("." + ext);
        } else if (ext) {
            extensionsToZip.add(ext);
        }
    });
}

function shouldZipFile(file: File): boolean {
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    return ext !== "" && extensionsToZip.has(ext);
}

async function zipFile(file: File): Promise<File> {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const zipData = zipSync({
        [file.name]: data
    });

    const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
    return new File([zipData as BlobPart], `${baseName}.zip`, { type: "application/zip" });
}

async function zipFolder(folderName: string, fileEntries: Record<string, Uint8Array>): Promise<File> {
    const zipData = zipSync(fileEntries);
    return new File([zipData as BlobPart], `${folderName}.zip`, { type: "application/zip" });
}

async function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
    return new Promise((resolve, reject) => {
        entry.file(resolve, reject);
    });
}

async function readDirectoryEntry(entry: FileSystemDirectoryEntry): Promise<Record<string, Uint8Array>> {
    const files: Record<string, Uint8Array> = {};

    async function readEntries(dirEntry: FileSystemDirectoryEntry, path = ""): Promise<void> {
        const reader = dirEntry.createReader();

        const readBatch = async (): Promise<void> => {
            return new Promise((resolve, reject) => {
                reader.readEntries(async entries => {
                    if (entries.length === 0) {
                        resolve();
                        return;
                    }

                    for (const entry of entries) {
                        const entryPath = path ? `${path}/${entry.name}` : entry.name;

                        if (entry.isFile) {
                            const file = await readFileEntry(entry as FileSystemFileEntry);
                            const arrayBuffer = await file.arrayBuffer();
                            files[entryPath] = new Uint8Array(arrayBuffer);
                        } else if (entry.isDirectory) {
                            await readEntries(entry as FileSystemDirectoryEntry, entryPath);
                        }
                    }

                    await readBatch();
                    resolve();
                }, reject);
            });
        };

        await readBatch();
    }

    await readEntries(entry);
    return files;
}

async function processFiles(files: File[]): Promise<File[]> {
    const processedFiles: File[] = [];

    for (const file of files) {
        if (shouldZipFile(file)) {
            logger.info(`Auto-zipping file: ${file.name}`);
            try {
                const zippedFile = await zipFile(file);
                processedFiles.push(zippedFile);
            } catch (error) {
                logger.error(`Failed to zip file ${file.name}:`, error);
                processedFiles.push(file);
            }
        } else {
            processedFiles.push(file);
        }
    }

    return processedFiles;
}

let interceptingEvents = false;

function isZipFilename(name: string) {
    return name.toLowerCase().endsWith(".zip");
}

const ZipContentsAccessory = ErrorBoundary.wrap(({ message }: { message: any; }) => {
    if (!settings.store.enableZipPreview) return null;

    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    const zipAttachments = attachments.filter((a: any) => isZipFilename(String(a?.filename ?? a?.name ?? "")));
    if (!zipAttachments.length) return null;

    return (
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {zipAttachments.map((att: any) => (
                <ZipAttachmentContents key={String(att.id ?? att.url ?? att.proxy_url ?? att.filename)} attachment={att} />
            ))}
        </div>
    );
}, { noop: true });

const ZipAttachmentContents = ErrorBoundary.wrap(({ attachment }: { attachment: any; }) => {
    const filename = String(attachment?.filename ?? attachment?.name ?? "archive.zip");
    const url = String(attachment?.proxy_url ?? attachment?.url ?? "");
    const size = typeof attachment?.size === "number" ? attachment.size : undefined;

    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [entries, setEntries] = useState<string[] | null>(null);

    async function ensureLoaded() {
        if (!url) {
            setError("Unable to read ZIP contents");
            return;
        }
        if (entries || loading) return;

        setLoading(true);
        setError(null);
        try {
            const normalized = normalizeAttachment(attachment);
            if (!normalized) throw new Error("Unable to read ZIP contents");

            const res = await getZipEntriesCached(normalized);
            setEntries(res);
        } catch (e: any) {
            setError(typeof e?.message === "string" ? e.message : (size != null && size > MAX_ZIP_BYTES ? "ZIP too large to preview" : "Unable to read ZIP contents"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "var(--text-normal)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {filename}
                </span>
                <span
                    role="button"
                    style={{ cursor: "pointer", color: "var(--text-link)", userSelect: "none" }}
                    onClick={() => {
                        setExpanded(v => {
                            const next = !v;
                            if (next) void ensureLoaded();
                            return next;
                        });
                    }}
                >
                    Contents {expanded ? "▴" : "▾"}
                </span>
            </div>

            {expanded && (
                <div
                    style={{
                        marginTop: "6px",
                        padding: "8px",
                        borderRadius: "8px",
                        background: "var(--background-secondary)",
                        border: "1px solid var(--background-modifier-accent)",
                    }}
                >
                    {loading ? (
                        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
                    ) : error ? (
                        <div style={{ color: "var(--text-danger)" }}>{error}</div>
                    ) : entries?.length ? (
                        <div>
                            <div style={{ color: "var(--text-muted)", marginBottom: "6px" }}>
                                {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                            </div>
                            <div
                                style={{
                                    maxHeight: "180px",
                                    overflowY: "auto",
                                    paddingRight: "6px",
                                }}
                            >
                                {entries.map((name, idx) => (
                                    <div
                                        key={`${idx}-${name}`}
                                        title={name}
                                        style={{
                                            padding: "2px 0",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            fontFamily: "var(--font-code, monospace)",
                                            color: "var(--text-normal)",
                                        }}
                                    >
                                        {name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: "var(--text-muted)" }}>No entries</div>
                    )}
                </div>
            )}
        </div>
    );
}, { noop: true });

function handleDrop(event: DragEvent) {
    if (!event.dataTransfer) return;

    const items = Array.from(event.dataTransfer.items);
    if (items.length === 0) return;

    const hasTargetedItem = items.some(item => {
        const entry = item.webkitGetAsEntry();
        return entry?.isDirectory || (item.kind === "file" && item.getAsFile() && shouldZipFile(item.getAsFile()!));
    });

    if (!hasTargetedItem) return;

    event.preventDefault();
    event.stopPropagation();

    const processPromises: Promise<File>[] = [];

    for (const item of items) {
        const entry = item.webkitGetAsEntry();

        if (entry?.isDirectory) {
            logger.info(`Zipping folder: ${entry.name}`);
            const folderPromise = readDirectoryEntry(entry as FileSystemDirectoryEntry)
                .then(fileEntries => zipFolder(entry.name, fileEntries))
                .catch(error => {
                    logger.error(`Failed to zip folder ${entry.name}:`, error);
                    return null;
                });
            processPromises.push(folderPromise as Promise<File>);
        } else if (entry?.isFile) {
            const file = item.getAsFile();
            if (file) {
                if (shouldZipFile(file)) {
                    logger.info(`Auto-zipping file: ${file.name}`);
                    processPromises.push(
                        zipFile(file).catch(error => {
                            logger.error(`Failed to zip file ${file.name}:`, error);
                            return file;
                        })
                    );
                } else {
                    processPromises.push(Promise.resolve(file));
                }
            }
        }
    }

    Promise.all(processPromises).then(processedFiles => {
        const validFiles = processedFiles.filter(f => f !== null);
        const channelId = SelectedChannelStore.getChannelId();
        const channel = ChannelStore.getChannel(channelId);
        if (channel && validFiles.length > 0) {
            setTimeout(() => UploadHandler.promptToUpload(validFiles, channel, DraftType.ChannelMessage), 10);
        }
    });
}

function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length === 0) return;

    const hasTargetedFile = files.some(shouldZipFile);
    if (!hasTargetedFile) return;

    event.preventDefault();
    event.stopPropagation();

    processFiles(files).then(processedFiles => {
        const channelId = SelectedChannelStore.getChannelId();
        const channel = ChannelStore.getChannel(channelId);
        if (channel && processedFiles.length > 0) {
            setTimeout(() => UploadHandler.promptToUpload(processedFiles, channel, DraftType.ChannelMessage), 10);
        }
    });
}

type NormalizedAttachment = {
    urls: string[];
    filename: string;
    size?: number;
};

function normalizeAttachment(item: any): NormalizedAttachment | null {
    const maybe = item?.originalItem ?? item?.attachment ?? item;
    const rawUrls = [
        maybe?.proxy_url,
        maybe?.proxyUrl,
        maybe?.url,
        maybe?.downloadUrl,
    ].filter((u: unknown): u is string => typeof u === "string" && u.length > 0);

    const filename = maybe?.filename ?? maybe?.fileName ?? maybe?.name;
    const size = typeof maybe?.size === "number" ? maybe.size : undefined;

    if (!rawUrls.length || typeof filename !== "string") return null;

    const urls = new Set<string>();
    for (const u of rawUrls) {
        urls.add(u);

        // If we only have a cdn.discordapp.com URL, also try the media.discordapp.net variant,
        // which is more likely to have permissive CORS headers for reading response bytes.
        try {
            const parsed = new URL(u);
            if (parsed.hostname === "cdn.discordapp.com" && parsed.pathname.startsWith("/attachments/")) {
                parsed.hostname = "media.discordapp.net";
                urls.add(parsed.toString());
            }
        } catch { /* ignore */ }
    }

    return { urls: Array.from(urls), filename, size };
}

async function getZipEntriesCached(attachment: NormalizedAttachment): Promise<string[]> {
    const primaryUrl = attachment.urls[0];
    const cached = zipContentsCache.get(primaryUrl);
    if (cached) return cached;

    const existing = zipContentsInFlight.get(primaryUrl);
    if (existing) return existing;

    const promise = (async () => {
        const entries = await fetchZipEntries(attachment);
        for (const url of attachment.urls) zipContentsCache.set(url, entries);
        return entries;
    })().finally(() => zipContentsInFlight.delete(primaryUrl));

    zipContentsInFlight.set(primaryUrl, promise);
    return promise;
}

async function tryNativeDownloadAttachment(attachment: NormalizedAttachment): Promise<Uint8Array | null> {
    try {
        if (!Native?.downloadBytes) return null;
        return await Native.downloadBytes(attachment.urls, MAX_ZIP_BYTES, FETCH_TIMEOUT_MS);
    } catch {
        return null;
    }
}

async function fetchZipEntries(attachment: NormalizedAttachment): Promise<string[]> {
    if (typeof attachment.size === "number" && attachment.size > MAX_ZIP_BYTES) {
        throw new Error("ZIP too large to preview");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        // Prefer native download helpers when present (avoids CORS/CDN issues in some setups)
        const nativeBytes = await tryNativeDownloadAttachment(attachment);
        if (nativeBytes) {
            if (nativeBytes.byteLength > MAX_ZIP_BYTES) throw new Error("ZIP too large to preview");
            return listZipEntries(nativeBytes);
        }

        const urlsToTry = attachment.urls;
        let lastErr: unknown = null;

        for (const url of urlsToTry) {
            try {
                // Using credentials will break CORS on media.discordapp.net (ACAO "*")
                const res = await fetch(url, {
                    signal: controller.signal,
                    credentials: "omit",
                    headers: { Accept: "*/*" }
                });
                if (!res.ok) {
                    let host = "";
                    try { host = new URL(url).host; } catch { }
                    lastErr = new Error(`Unable to read ZIP contents (HTTP ${res.status}${host ? ` from ${host}` : ""})`);
                    continue;
                }

                const buf = await res.arrayBuffer();
                if (buf.byteLength > MAX_ZIP_BYTES) throw new Error("ZIP too large to preview");

                return listZipEntries(new Uint8Array(buf));
            } catch (err) {
                lastErr = err;
                continue;
            }
        }

        throw lastErr ?? new Error("Unable to read ZIP contents");
    } catch (err: any) {
        if (err?.name === "AbortError") throw new Error("Unable to read ZIP contents");
        throw err instanceof Error ? err : new Error("Unable to read ZIP contents");
    } finally {
        clearTimeout(timeout);
    }
}

function listZipEntries(bytes: Uint8Array): string[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const eocd = findEocdOffset(bytes);
    if (eocd < 0) throw new Error("Unable to read ZIP contents");

    const totalEntries = view.getUint16(eocd + 10, true);
    const cdSize = view.getUint32(eocd + 12, true);
    const cdOffset = view.getUint32(eocd + 16, true);

    if (cdOffset + cdSize > bytes.length) throw new Error("Unable to read ZIP contents");

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const entries: string[] = [];

    let off = cdOffset;
    const end = cdOffset + cdSize;

    const toRead = Math.min(totalEntries, MAX_ENTRIES);
    for (let i = 0; i < toRead; i++) {
        if (off + 46 > bytes.length || off + 46 > end) break;

        const sig = view.getUint32(off, true);
        if (sig !== 0x02014b50) break;

        const nameLen = view.getUint16(off + 28, true);
        const extraLen = view.getUint16(off + 30, true);
        const commentLen = view.getUint16(off + 32, true);

        const nameStart = off + 46;
        const nameEnd = nameStart + nameLen;
        if (nameEnd > bytes.length || nameEnd > end) break;

        const nameBytes = bytes.subarray(nameStart, nameEnd);
        const name = decoder.decode(nameBytes);
        if (name) entries.push(name);

        off = nameEnd + extraLen + commentLen;
        if (off > end) break;
    }

    return entries;
}

function findEocdOffset(bytes: Uint8Array): number {
    const minEocdLen = 22;
    if (bytes.length < minEocdLen) return -1;

    const maxBack = Math.min(bytes.length - minEocdLen, 0x10000 + minEocdLen);
    for (let i = bytes.length - minEocdLen; i >= bytes.length - maxBack; i--) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
            return i;
        }
    }

    return -1;
}

export default definePlugin({
    name: "AutoZipper",
    description: "Automatically zips specified file types and folders before uploading to Discord",
    authors: [EquicordDevs.SSnowly],
    settings,

    start() {
        if (interceptingEvents) return;
        interceptingEvents = true;

        parseExtensions();

        document.addEventListener("drop", handleDrop, true);
        document.addEventListener("paste", handlePaste, true);
    },

    stop() {
        document.removeEventListener("drop", handleDrop, true);
        document.removeEventListener("paste", handlePaste, true);
        interceptingEvents = false;
    },

    dependencies: ["MessageAccessoriesAPI"],

    renderMessageAccessory({ message }) {
        return <ZipContentsAccessory message={message} />;
    },
});
