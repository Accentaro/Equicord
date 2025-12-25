/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MediaForType, MediaType } from "./types";

export function guessTypeFromAttachment(att: any): MediaType {
    const url = String(att?.url ?? "");
    const ct = att?.content_type as string | undefined;
    if (ct?.startsWith("image/")) return url.split("?")[0].endsWith(".gif") || ct === "image/gif" ? "gif" : "image";
    if (ct?.startsWith("video/")) return "video";
    if (ct?.startsWith("audio/")) return "audio";
    return "file";
}

export function extractMediaCandidatesFromMessage(message: any): Array<{ type: MediaType; url: string; name: string; extra?: Partial<MediaForType<any>>; }> {
    return [
        ...extractFromMessageAttachments(message),
        ...extractFromMessageEmbeds(message),
        ...extractFromMessageStickers(message),
    ];
}

export function extractFromMessageAttachments(message: any) {
    const out: Array<{ type: MediaType; url: string; name: string; extra?: Partial<MediaForType<any>>; }> = [];
    for (const a of (message.attachments ?? []) as any[]) {
        const url = a?.url;
        if (!url) continue;
        const type = guessTypeFromAttachment(a);
        out.push({
            type,
            url,
            name: a.filename ?? url,
            extra: {
                ...(type === "gif" ? { src: a.proxy_url ?? a.url } : {}),
                ...(a.width && a.height ? { width: a.width, height: a.height } : {}),
            } as any
        });
    }
    return out;
}

export function extractFromMessageEmbeds(message: any) {
    const out: Array<{ type: MediaType; url: string; name: string; extra?: Partial<MediaForType<any>>; }> = [];
    for (const e of (message.embeds ?? []) as any[]) {
        if (e?.image?.url) out.push({ type: e.image.url.split("?")[0].endsWith(".gif") ? "gif" : "image", url: e.image.url, name: e.title ?? e.image.url });
        else if (e?.video?.url) out.push({ type: "video", url: e.video.url, name: e.title ?? e.video.url });
    }
    return out;
}

const StickerExt = [, "png", "png", "json", "gif"] as const;

function getStickerUrl(id: string, formatType: number) {
    // Use the CDN endpoint (not media proxy) to preserve animated sticker formats (gif/apng).
    // The media proxy endpoint can return non-animated conversions for some sticker formats.
    const ext = StickerExt[formatType as 1 | 2 | 3 | 4] ?? "png";
    return `https://cdn.discordapp.com/stickers/${id}.${ext}`;
}

export function extractFromMessageStickers(message: any) {
    const out: Array<{ type: MediaType; url: string; name: string; extra?: Partial<MediaForType<any>>; }> = [];
    for (const s of (message.stickerItems ?? []) as any[]) {
        const id = s?.id;
        if (!id) continue;
        const formatType = Number(s?.format_type ?? s?.formatType ?? 1);
        const url = getStickerUrl(id, formatType);
        const type: MediaType = formatType === 4 ? "gif" : formatType === 3 ? "file" : "image";
        out.push({
            type,
            url,
            name: s?.name ?? `sticker-${id}`,
            extra: {
                ...(type === "gif" ? { src: url } : {}),
                stickerId: String(id),
                stickerFormatType: formatType,
            } as any
        });
    }
    return out;
}
