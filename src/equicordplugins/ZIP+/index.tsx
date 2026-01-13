/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { ChannelStore, DraftType, Menu, React, SelectedChannelStore, showToast, UploadHandler, useEffect, useState } from "@webpack/common";
import { zipSync } from "fflate";

import ZipPreview from "./ZipPreview";

const logger = new Logger("ZIP+");

const settings = definePluginSettings({
    enableAutoZipper: {
        type: OptionType.BOOLEAN,
        description: "Automatically zip specified file types and folders before upload",
        default: true
    },
    extensions: {
        type: OptionType.STRING,
        description: "Comma-separated list of file extensions to auto-zip (e.g., .psd,.blend,.exe,.dmg)",
        default: ".psd,.blend,.exe,.dmg,.app,.apk,.iso",
        onChange: () => {
            extensionsToZip.clear();
            parseExtensions();
        }
    }
});

const extensionsToZip = new Set<string>();
let interceptingEvents = false;

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

function handleDrop(event: DragEvent) {
    if (!event.dataTransfer) return;
    if (!settings.store.enableAutoZipper) return;

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
    if (!settings.store.enableAutoZipper) return;

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

// Get native helper for desktop
function getNative(): PluginNative<typeof import("./native")> | null {
    if (!IS_DISCORD_DESKTOP || !VencordNative?.pluginHelpers) return null;
    const helpers = VencordNative.pluginHelpers;
    const direct =
        (helpers.ZipPreview as PluginNative<typeof import("./native")> | undefined) ||
        (helpers.zipPreview as PluginNative<typeof import("./native")> | undefined);

    if (direct?.fetchAttachment) return direct;

    const native = Object.values(helpers)
        .find(m => typeof (m as any)?.zipPreviewUniqueIdThingyIdkMan === "function") as
        PluginNative<typeof import("./native")> | undefined;

    return native?.fetchAttachment ? native : null;
}

async function fetchBlob(url: string): Promise<Blob | null> {
    const Native = getNative();
    if (Native?.fetchAttachment) {
        try {
            const buffer = await Native.fetchAttachment(url);
            if (buffer?.length > 0) {
                const arrayBuffer = new ArrayBuffer(buffer.length);
                new Uint8Array(arrayBuffer).set(buffer);
                return new Blob([arrayBuffer]);
            }
        } catch (err) {
            console.error("ZIP+: native fetch error", err);
        }
    }

    if (IS_DISCORD_DESKTOP) return null;

    try {
        const res = await fetch(url, {
            mode: "cors",
            credentials: "include",
            cache: "no-cache"
        });
        if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 0) return blob;
        }
    } catch (err: any) {
        if (err?.name !== "TypeError" || (!err?.message?.includes("CORS") && !err?.message?.includes("Failed to fetch"))) {
            console.error("ZIP+: unexpected fetch error", err);
        }
    }

    try {
        const blob = await fetchBlobWithXHR(url);
        if (blob) return blob;
    } catch (err) {
        if (!(err instanceof TypeError)) {
            console.error("ZIP+: unexpected XHR error", err);
        }
    }

    return null;
}

async function fetchBlobWithXHR(url: string): Promise<Blob | null> {
    return new Promise(resolve => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = "blob";
            xhr.withCredentials = true;
            xhr.timeout = 30000;

            xhr.onload = () => {
                if (xhr.status === 200 && xhr.response instanceof Blob && xhr.response.size > 0) {
                    resolve(xhr.response);
                } else {
                    if (xhr.status > 0 && xhr.status !== 200) {
                        console.error("ZIP+: XHR HTTP error", xhr.status, xhr.statusText);
                    }
                    resolve(null);
                }
            };

            xhr.onerror = () => resolve(null);
            xhr.ontimeout = () => {
                console.error("ZIP+: XHR timeout");
                resolve(null);
            };

            xhr.send();
        } catch (err) {
            console.error("ZIP+: XHR setup failed", err);
            resolve(null);
        }
    });
}

function MessageContextMenu(children: Array<any>, props: any) {
    try {
        const { mediaItem, message } = props ?? {};
        if (!mediaItem || !message) return;

        const attachment = (message.attachments || []).find((a: any) =>
            a?.proxy_url === mediaItem.proxyUrl || a?.url === mediaItem.url || a?.proxy_url === mediaItem.url || a?.url === mediaItem.proxyUrl
        );

        const filename = attachment?.filename || attachment?.title || mediaItem?.filename || mediaItem?.name || "";
        const contentType = attachment?.content_type || mediaItem?.contentType || "";
        const url = mediaItem?.url || attachment?.url || attachment?.proxy_url || "";
        const looksLikeZip = isZipAttachment(filename, contentType, url);
        if (!looksLikeZip) return;

        children.push(
            <Menu.MenuItem
                id="zippreview-open"
                label="Preview zip"
                action={async () => {
                    try {
                        const url = attachment?.proxy_url || attachment?.url || mediaItem?.proxyUrl || mediaItem?.url;
                        if (!url) {
                            showToast("No URL available for attachment");
                            return;
                        }

                        let blob = await fetchBlob(url);
                        if (!blob && attachment?.url && attachment?.proxy_url && attachment.url !== attachment.proxy_url) {
                            const altUrl = url === attachment.proxy_url ? attachment.url : attachment.proxy_url;
                            blob = await fetchBlob(altUrl);
                        }

                        if (!blob) {
                            const Native = getNative();
                            const message = Native?.fetchAttachment
                                ? "Failed to fetch attachment. Please try again."
                                : (IS_DISCORD_DESKTOP
                                ? "ZIP+ native helper missing. Please rebuild Equicord."
                                : "Unable to fetch attachment: CORS restrictions on web. Desktop app required for zip preview.");
                            showToast(message);
                            return;
                        }

                        if (blob.size === 0) {
                            console.error("ZIP+: fetched empty blob for", url);
                            showToast("Failed to fetch attachment for preview (empty response). Try Download.");
                            return;
                        }

                        openModal((props: any) => <ZipPreview blob={blob} name={filename} /> as any);
                    } catch (err) {
                        console.error("ZIP+: failed to open from context menu", err);
                        showToast("Failed to open zip preview");
                    }
                }}
            />
        );
    } catch {
        // ignore
    }
}

// Store for expanded state and loaded blobs per attachment
const expandedState = new Map<string, boolean>();
const blobCache = new Map<string, Blob>();

function isZipAttachment(filename?: string, contentType?: string, url?: string): boolean {
    const name = (filename || "").toLowerCase();
    const type = (contentType || "").toLowerCase();
    const cleanUrl = (url || "").split("?")[0].toLowerCase();
    return type.includes("zip") || name.endsWith(".zip") || cleanUrl.endsWith(".zip");
}

function getAttachmentKey(attachment: any): string {
    return (
        attachment?.id ||
        attachment?.filename ||
        attachment?.name ||
        attachment?.url ||
        attachment?.proxy_url ||
        "unknown"
    );
}

// Component to render inside each zip attachment
function ZipAttachmentPreview({ attachment }: { attachment: any; }) {
    const filename = attachment?.filename || attachment?.name || "";
    const contentType = attachment?.content_type || "";
    const url = attachment?.url || attachment?.proxy_url || "";
    const looksLikeZip = isZipAttachment(filename, contentType, url);
    const attachmentKey = getAttachmentKey(attachment);
    const [blob, setBlob] = useState<Blob | null>(() => blobCache.get(attachmentKey) || null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<boolean>(() => {
        try { return expandedState.get(attachmentKey) ?? false; } catch { return false; }
    });

    useEffect(() => {
        if (!looksLikeZip) return;
        if (blobCache.has(attachmentKey)) return;

        let mounted = true;
        (async () => {
            try {
                const url = attachment.proxy_url || attachment.url;
                if (!url) {
                    if (mounted) setError("No URL for attachment");
                    return;
                }

                let b = await fetchBlob(url);
                if (!b && attachment.proxy_url && attachment.url && attachment.proxy_url !== attachment.url) {
                    const altUrl = url === attachment.proxy_url ? attachment.url : attachment.proxy_url;
                    b = await fetchBlob(altUrl);
                }

                if (!b) {
                    if (mounted) {
                        const Native = getNative();
                        setError(Native?.fetchAttachment
                            ? "Failed to fetch archive. Please try again."
                            : (IS_DISCORD_DESKTOP
                                ? "ZIP+ native helper missing. Please rebuild Equicord."
                                : "Unable to fetch: CORS restrictions on web. Desktop app required."));
                    }
                    return;
                }

                if (b.size === 0) {
                    if (mounted) setError("Failed to fetch archive (empty file)");
                    return;
                }

                if (mounted) {
                    setBlob(b);
                    blobCache.set(attachmentKey, b);
                }
            } catch (err) {
                console.error("ZIP+: fetch error", err);
                if (mounted) setError("Failed to fetch archive");
            }
        })();
        return () => { mounted = false; };
    }, [attachmentKey]);

    if (!looksLikeZip) return null;
    if (error) return <div className="zp-error">{error}</div>;
    if (!blob) return <div className="zp-loading">Loading preview…</div>;

    return (
        <div className="zp-attachment-integrated">
            <ZipPreview
                blob={blob}
                name={attachment.filename || attachment.name || "archive.zip"}
                expanded={expanded}
                onExpandedChange={v => { setExpanded(v); expandedState.set(attachmentKey, v); }}
            />
        </div>
    );
}

export default definePlugin({
    name: "ZIP+",
    description: "Preview and navigate inside zip files, plus auto-zip uploads.",
    authors: [EquicordDevs.justjxke, EquicordDevs.SSnowly, EquicordDevs.benjii],

    settings,

    patches: [
        {
            find: "#{intl::ATTACHMENT_PROCESSING}",
            replacement: {
                match: /null!=\i&&\i\(\)(?<=renderAdjacentContent.*?\}=(\i);.*?)/,
                replace: "$self.ZipAttachmentPreview({ attachment: $1 })"
            }
        }
    ],

    contextMenus: {
        "message": MessageContextMenu
    },

    ZipAttachmentPreview,

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
    }
});
