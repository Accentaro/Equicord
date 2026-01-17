import { decompressFrames, parseGIF } from "gifuct-js";
import GifRenderer, { type GifTransform } from "./gifRenderer";
import { showError } from "../ui/statusCard";

export default async function captionGif(url: string, width: number, height: number, transform: GifTransform) {
    const res = await fetch(url).catch(() => null);
    if (!res || !res.ok) {
        showError("Failed to fetch gif");
        return;
    }
    const buffer = await res.arrayBuffer();

    const parsed = parseGIF(buffer);
    const frames = decompressFrames(parsed, true);

    const renderer = new GifRenderer({ width, height, transform, frames: frames.length });
    while (frames.length > 0) {
        const frame = frames.shift();
        if (!frame) break;
        renderer.addGifFrame(frame, parsed);
        await new Promise((res) => setTimeout(res));
    }

    renderer.render();
}
