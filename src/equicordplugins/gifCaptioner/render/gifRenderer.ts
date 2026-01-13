import GifWorker from "../gif.worker.txt";
import { getUrl } from "../utils/blob";
import { getLines } from "../utils/canvas";
import GIF from "gif.js";
import { uploadFile } from "../utils/upload";
import type { ParsedFrame, ParsedGif } from "gifuct-js";
import { getMaxFileSize } from "../utils/permissions";
import { getSelectedFont } from "../index";
import { showError } from "../ui/statusCard";

export interface CaptionTransform {
	text: string;
	size: number;
	type: "caption";
}

export type GifTransform = CaptionTransform;
export type OnSubmit = (callback: () => GifTransform) => void;

let worker = getUrl(GifWorker);

export default class GifRenderer {
	canvas = document.createElement("canvas");
	ctx = this.canvas.getContext("2d")!;
	topOffset = 0;
	width: number;
	height: number; // Doesn't include caption height
	transform: GifTransform;
	gif: GIF;

	constructor({ frames, width, height, transform }:
		{ frames: number, width: number, height: number, transform: GifTransform }) {
		this.width = width;
		this.height = height;
		this.transform = transform;

		if(!worker.url) {
			showError("Attempted to encode gif while GifCaptioner is disabled");
			throw new Error("Worker url missing");
		}

		let fullHeight = height;

		if(transform.type === "caption") {
			this.ctx.font = `${transform.size}px ${getSelectedFont()}`;
			let lines = getLines(this.ctx, transform.text, this.width);
			fullHeight = lines.length * transform.size + 10 + this.height;
		}

		const fullSize = fullHeight * this.width;
		// Gifs are compressed a bit so this is always going to overshoot
		const sizeEstimate = fullSize * frames;
		const maxSize = getMaxFileSize(); // in bytes
		const scaleFactor = Math.max(1, Math.sqrt(sizeEstimate / maxSize));

		const newWidth = Math.floor(this.width / scaleFactor);
		const newHeight = Math.floor(this.height / scaleFactor);
		const newFullHeight = Math.floor(fullHeight / scaleFactor);

		this.width = this.canvas.width = newWidth;
		this.height = newHeight;
		this.canvas.height = newFullHeight;

		this.gif = new GIF({
			workerScript: worker.url,
			height: newFullHeight,
			width: newWidth
		});

		if(transform.type === "caption") {
			const newSize = Math.floor(transform.size / scaleFactor);
			this.drawCaption(transform.text, newWidth, newSize);
		}
	}

	tempCanvas?: HTMLCanvasElement;
	tempCtx?: CanvasRenderingContext2D;
	gifCanvas?: HTMLCanvasElement;
	gifCtx?: CanvasRenderingContext2D;
	needsDisposal = false;
	frameImageData?: ImageData;
	addGifFrame(source: ParsedFrame, parsed: ParsedGif) {
		if(!this.tempCanvas) this.tempCanvas = document.createElement("canvas");
		if(!this.tempCtx) this.tempCtx = this.tempCanvas.getContext("2d", { willReadFrequently: true })!;
		if(!this.gifCanvas) {
			this.gifCanvas = document.createElement("canvas");
			this.gifCanvas.width = parsed.lsd.width;
			this.gifCanvas.height = parsed.lsd.height;
		}
		if(!this.gifCtx) this.gifCtx = this.gifCanvas.getContext("2d", { willReadFrequently: true })!;

		if(this.needsDisposal) {
			this.gifCtx.clearRect(0, this.topOffset, this.width, this.height);
			this.needsDisposal = false;
		}

		if(source.disposalType == 2) this.needsDisposal = true;

		if(
			!this.frameImageData ||
			source.dims.width !== this.frameImageData.width ||
			source.dims.height !== this.frameImageData.height
		) {
			this.tempCanvas.width = source.dims.width;
			this.tempCanvas.height = source.dims.height;
			this.frameImageData = this.tempCtx.createImageData(source.dims.width, source.dims.height);
		}

		// Do all the nonsense to copy it to the real canvas
		this.frameImageData.data.set(source.patch);
		this.tempCtx.putImageData(this.frameImageData, 0, 0);
		this.gifCtx.drawImage(this.tempCanvas, source.dims.left, source.dims.top);
		this.ctx.drawImage(this.gifCanvas, 0, this.topOffset, this.width, this.height);
		this.addFrameToGif(source.delay);
	}

	addVideoFrame(source: VideoFrame, delay: number) {
		this.ctx.drawImage(source, 0, this.topOffset, this.width, this.height);
		this.addFrameToGif(delay);
		source.close();
	}

	addFrameToGif(delay: number) {
		this.gif.addFrame(this.ctx, { delay, copy: true });
	}

	render() {
		this.gif.once("finished", (blob) => {
			const file = new File([ blob ], "rendered.gif", { type: "image/gif" });
			uploadFile(file);
		});

		this.gif.render();
	}

	drawCaption(text: string, width: number, size: number) {
		this.ctx.font = `${size}px ${getSelectedFont()}`;
		let lines = getLines(this.ctx, text, width);
		this.topOffset = lines.length * size + 10;

		// add background
		this.ctx.fillStyle = "white";
		this.ctx.fillRect(0, 0, width, lines.length * size + 10);

		// draw text
		this.ctx.fillStyle = "black";
		this.ctx.textAlign = "center";
        this.ctx.textBaseline = "top";
		for(let i = 0; i < lines.length; i++) {
			this.ctx.fillText(lines[i], width / 2, size * i + 5);
		}
	}

}
