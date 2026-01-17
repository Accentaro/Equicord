/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createFile, DataStream, ISOFile, MP4BoxBuffer } from "mp4box";

import { fetchMedia } from "../utils/fetchMedia";
import { showError } from "../ui/statusCard";
import GifRenderer, { type GifTransform } from "./gifRenderer";

export default async function captionMp4(url: string | string[], width: number, height: number, transform: GifTransform) {
    const media = await fetchMedia(url, ({ buffer, contentType }) => {
		const header = new Uint8Array(buffer, 0, 12);
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
		return isVideoType || isMp4Header || isWebmHeader;
	});
    if (!media) {
        showError("Failed to fetch gif");
        return;
    }

	const { buffer: arrayBuffer, contentType } = media;
	const primaryUrl = Array.isArray(url) ? url[0] ?? "" : url;
	const urlLower = primaryUrl.toLowerCase();
	const header = new Uint8Array(arrayBuffer, 0, 12);
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
	const isMp4 = contentType.includes("mp4")
		|| urlLower.endsWith(".mp4")
		|| urlLower.endsWith(".m4v")
		|| isMp4Header;
	const isWebm = contentType.includes("webm")
		|| urlLower.endsWith(".webm")
		|| isWebmHeader;
    const isVideo = contentType.startsWith("video/") || isMp4 || isWebm;
    if (!isVideo) {
        showError("Unsupported media format");
        return;
    }

    if (isVideo && !isMp4) {
        await renderVideoWithElement({
            buffer: arrayBuffer,
            mimeType: contentType || (isWebm ? "video/webm" : "video/mp4"),
			width,
			height,
			transform
		});
		return;
	}

	const onError = () => {
		showError("Failed to parse gif");
	};

	// Count up the number of frames
	let frames = 0;

	await parseMp4({
		buffer: arrayBuffer,
		onError,
		onFrame: frame => {
			frame.source.close();
			frames++;
		}
	});

	// Actually render the gif
	const renderer = new GifRenderer({ frames, width, height, transform });
	await parseMp4({
		buffer: arrayBuffer,
		onError,
		onFrame: frame => {
			renderer.addVideoFrame(frame.source, frame.delay);
		}
	});

	// Encode it
	renderer.render();
}

// browsers tend to cap gifs at 50 fps
const minFrameLength = 1000 / 50;

interface ParseMP4Options {
	buffer: ArrayBuffer;
	onFrame: (frame: { source: VideoFrame, delay: number }) => void;
	onError?: () => void;
}

interface RenderVideoOptions {
	buffer: ArrayBuffer;
	mimeType: string;
	width: number;
	height: number;
	transform: GifTransform;
}

function renderVideoWithElement({ buffer, mimeType, width, height, transform }: RenderVideoOptions) {
	return new Promise<void>(resolve => {
		const blob = new Blob([buffer], { type: mimeType });
		const objectUrl = URL.createObjectURL(blob);
		const video = document.createElement("video");
		video.src = objectUrl;
		video.muted = true;
		video.playsInline = true;
		video.preload = "auto";

		let done = false;
		const cleanup = () => {
			URL.revokeObjectURL(objectUrl);
			video.remove();
		};
		const finish = () => {
			if (done) return;
			done = true;
			cleanup();
			resolve();
		};
		const fail = () => {
			if (done) return;
			done = true;
			cleanup();
			showError("Failed to parse gif");
			resolve();
		};

		const seekTo = (time: number) => new Promise<boolean>(resolveSeek => {
			let doneSeek = false;
			const cleanup = () => {
				if (doneSeek) return;
				doneSeek = true;
				clearTimeout(timer);
				video.removeEventListener("seeked", handleSeeked);
				video.removeEventListener("error", handleError);
			};
			const handleSeeked = () => {
				cleanup();
				resolveSeek(true);
			};
			const handleError = () => {
				cleanup();
				resolveSeek(false);
			};
			const timer = setTimeout(() => {
				cleanup();
				resolveSeek(false);
			}, 2000);

			video.addEventListener("seeked", handleSeeked, { once: true });
			video.addEventListener("error", handleError, { once: true });
			video.currentTime = Math.min(Math.max(time, 0), Number.isFinite(video.duration) ? video.duration : time);
		});

		const captureBySeeking = async (renderer: GifRenderer, startTime: number) => {
            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            if (!duration) {
                showError("Failed to parse gif");
                finish();
                return;
            }

			const step = minFrameLength / 1000;
			let time = Math.min(duration, Math.max(0, startTime + step));
			let lastTime = startTime;
            while (!done && time <= duration + 0.0001) {
                const ok = await seekTo(time);
                if (!ok) {
                    break;
                }

                try {
                    const delay = Math.max(minFrameLength, (time - lastTime) * 1000);
                    renderer.addVideoFrame(new VideoFrame(video), delay);
                    lastTime = time;
                } catch (error) {
                    break;
                }

				time += step;
			}

            renderer.render();
            finish();
		};

		video.addEventListener("error", fail, { once: true });
		video.addEventListener("loadedmetadata", () => {
			const duration = Number.isFinite(video.duration) ? video.duration : 0;
			const frameEstimate = duration > 0
				? Math.max(1, Math.ceil((duration * 1000) / minFrameLength))
				: 1;
            const renderer = new GifRenderer({ frames: frameEstimate, width, height, transform });
            let lastFrameTime = 0;
            let lastFrameAt = 0;
            let startedAt = performance.now();
            let useManual = false;

            const startManual = () => {
                if (done || useManual) return;
                useManual = true;
                video.pause();
                captureBySeeking(renderer, lastFrameTime);
            };

			const handleFrame = (now: number, metadata: VideoFrameCallbackMetadata) => {
				if (done || useManual) return;
				lastFrameAt = performance.now();
				if (video.ended) {
					renderer.render();
					finish();
					return;
				}

				const delay = (metadata.mediaTime - lastFrameTime) * 1000;
                if (delay >= minFrameLength) {
                    lastFrameTime = metadata.mediaTime;
                    renderer.addVideoFrame(new VideoFrame(video), delay);
                }

				video.requestVideoFrameCallback(handleFrame);
			};

			if (typeof video.requestVideoFrameCallback === "function") {
				video.requestVideoFrameCallback(handleFrame);
			} else {
				startManual();
			}
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {
                    startManual();
                });
            }

			const stallTimer = setInterval(() => {
				if (done || useManual) {
					clearInterval(stallTimer);
					return;
				}
				const now = performance.now();
				if (!lastFrameAt && now - startedAt > 1500) {
					startManual();
					clearInterval(stallTimer);
					return;
				}
				if (lastFrameAt && now - lastFrameAt > 2000) {
					startManual();
					clearInterval(stallTimer);
				}
			}, 500);
		}, { once: true });
	});
}

function parseMp4({ buffer, onFrame, onError }: ParseMP4Options) {
	return new Promise<void>(res => {
		const mp4Buffer = buffer as MP4BoxBuffer;
		mp4Buffer.fileStart = 0;

		let time = 0;
		let lastFrameTime = 0;

		// mostly stolen from https://github.com/w3c/webcodecs/tree/main/samples/video-decode-display
		const decoder = new VideoDecoder({
			output(frame) {
				if(!frame.duration) return frame.close();
				const duration = frame.duration / 1000;

				time += duration;
				const delay = time - lastFrameTime;
				if(delay >= minFrameLength) {
					lastFrameTime = time;
					onFrame({ source: frame, delay });
				} else {
					frame.close();
				}
			},
			error() {
				onError?.();
			}
		});

		const file = createFile();
		file.onError = () => onError?.();
		file.onReady = info => {
			const track = info.videoTracks[0];
			if (!track.video) {
				onError?.();
				return;
			}

			try {
				decoder.configure({
					codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
					codedHeight: track.video.height,
					codedWidth: track.video.width,
					description: getDescription(file, track.id)
				});
			} catch {
				onError?.();
				return;
			}

			file.setExtractionOptions(track.id);
			file.start();
		};
		file.onSamples = (id, ref, samples) => {
			// I think this only fires once
			for(const sample of samples) {
				if(!sample.data) continue;

				const chunk = new EncodedVideoChunk({
					type: sample.is_sync ? "key" : "delta",
					timestamp: 1e6 * sample.cts / sample.timescale,
					duration: 1e6 * sample.duration / sample.timescale,
					data: sample.data
				});

				decoder.decode(chunk);
			}

			decoder.flush().then(res);
		};

		file.appendBuffer(mp4Buffer);
	});
}

// No idea what this does
function getDescription(file: ISOFile, id: number) {
	const trak = file.getTrackById(id);
	for (const entry of trak.mdia.minf.stbl.stsd.entries) {
		// @ts-ignore not documented for some reason
		const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
		if (box) {
			const stream = new DataStream(undefined, 0, 1);
			box.write(stream);
			return new Uint8Array(stream.buffer, 8); // Remove the box header.
		}
	}
	throw new Error("avcC, hvcC, vpcC, or av1C box not found");
}
