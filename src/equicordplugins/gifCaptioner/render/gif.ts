/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { decompressFrames, parseGIF } from "gifuct-js";

import { fetchMedia } from "../utils/fetchMedia";
import { showError } from "../ui/statusCard";
import GifRenderer, { type GifTransform } from "./gifRenderer";
import captionMp4 from "./mp4";

export default async function captionGif(url: string | string[], width: number, height: number, transform: GifTransform) {
    const media = await fetchMedia(url, ({ buffer, contentType }) => {
        const header = new Uint8Array(buffer, 0, 12);
        const isGifHeader = header.length >= 3
            && header[0] === 0x47
            && header[1] === 0x49
            && header[2] === 0x46;
        const isMp4Header = header.length >= 8
            && header[4] === 0x66
            && header[5] === 0x74
            && header[6] === 0x79
            && header[7] === 0x70;
        const isWebmHeader = header.length >= 4
            && header[0] === 0x1a
            && header[1] === 0x45
            && header[2] === 0xdf
            && header[3] === 0xa3;
        const isVideoType = contentType.startsWith("video/");
        const isGifType = contentType.includes("gif");
        return isGifHeader || isGifType || isMp4Header || isWebmHeader || isVideoType;
    });
    if (!media) {
        showError("Failed to fetch gif");
        return;
    }

    const header = new Uint8Array(media.buffer, 0, 12);
    const isGif = header.length >= 3 && header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
    const isMp4Header = header.length >= 8
        && header[4] === 0x66
        && header[5] === 0x74
        && header[6] === 0x79
        && header[7] === 0x70;
    const isWebmHeader = header.length >= 4
        && header[0] === 0x1a
        && header[1] === 0x45
        && header[2] === 0xdf
        && header[3] === 0xa3;
    const isVideo = media.contentType.startsWith("video/") || isMp4Header || isWebmHeader;
    if (!isGif) {
        if (!isVideo) {
            showError("Unsupported media format");
            return;
        }
        await captionMp4(url, width, height, transform);
        return;
    }

    const parsed = parseGIF(media.buffer);
    const frames = decompressFrames(parsed, true);

    const renderer = new GifRenderer({ width, height, transform, frames: frames.length });
    while (frames.length > 0) {
        const frame = frames.shift();
        if (!frame) break;
        renderer.addGifFrame(frame, parsed);
        await new Promise(res => setTimeout(res));
    }

    renderer.render();
}
