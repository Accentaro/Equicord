import { createFile, DataStream, ISOFile, MP4BoxBuffer } from "mp4box";
import GifRenderer, { type GifTransform } from "./gifRenderer";
import { showError } from "../ui/statusCard";

export default async function captionMp4(url: string, width: number, height: number, transform: GifTransform) {
	let res: Response;
	try {
		res = await fetch(url);
	} catch {
		showError("Failed to fetch gif");
		return;
	}

	if (!res.ok) {
		showError("Failed to fetch gif");
		return;
	}

	const arrayBuffer = await res.arrayBuffer();

	const onError = () => {
		showError("Failed to parse gif");
	}

	// Count up the number of frames
	let frames = 0;

	await parseMp4({
		buffer: arrayBuffer,
		onError,
		onFrame: (frame) => {
			frame.source.close();
			frames++;
		}
	});

	// Actually render the gif
	const renderer = new GifRenderer({ frames, width, height, transform });
	await parseMp4({
		buffer: arrayBuffer,
		onError,
		onFrame: (frame) => {
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

function parseMp4({ buffer, onFrame, onError }: ParseMP4Options) {
	return new Promise<void>((res) => {
		let mp4Buffer = buffer as MP4BoxBuffer;
		mp4Buffer.fileStart = 0;

		let time = 0;
		let lastFrameTime = 0;
	
		// mostly stolen from https://github.com/w3c/webcodecs/tree/main/samples/video-decode-display
		const decoder = new VideoDecoder({
			output(frame) {
				if(!frame.duration) return frame.close();
				let duration = frame.duration / 1000;
				
				time += duration;
				let delay = time - lastFrameTime;
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
	
		let file = createFile();
		file.onError = () => onError?.();
		file.onReady = (info) => {
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
		}
		file.onSamples = (id, ref, samples) => {
			// I think this only fires once
			for(let sample of samples) {
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
		}
	
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
			return new Uint8Array(stream.buffer, 8);  // Remove the box header.
		}
	}
	throw new Error("avcC, hvcC, vpcC, or av1C box not found");
}
