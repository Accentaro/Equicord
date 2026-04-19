/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { useEffect, useMemo, useRef, useState } from "@webpack/common";

import { FontSelector, getSelectedFont } from "../index";
import type { CaptionMedia, OnSubmit } from "../types";
import { getLines } from "../utils/canvas";
import { getCanvasFont, loadGoogleFont } from "../utils/fonts";

const cl = classNameFactory("vc-gif-captioner-");
const FALLBACK_MEDIA_WIDTH = 480;
const FALLBACK_MEDIA_HEIGHT = 270;
const MAX_PREVIEW_WIDTH = 560;
const PREVIEW_HORIZONTAL_MARGIN = 96;
const PREVIEW_VERTICAL_CHROME = 320;

function getDefaultFontSize(width: number) {
    return Math.round(Math.min(36, Math.max(14, width / 24)));
}

function getViewportSize() {
    return {
        height: window.innerHeight,
        width: window.innerWidth
    };
}

export default function Captioner({ media, onSubmit }: { media: CaptionMedia; onSubmit: OnSubmit; }) {
    const [text, setText] = useState("");
    const [mediaWidth, setMediaWidth] = useState(Math.max(1, media.width || FALLBACK_MEDIA_WIDTH));
    const [mediaHeight, setMediaHeight] = useState(Math.max(1, media.height || FALLBACK_MEDIA_HEIGHT));
    const [size, setSize] = useState(() => getDefaultFontSize(media.width || FALLBACK_MEDIA_WIDTH));
    const [hasCustomSize, setHasCustomSize] = useState(false);
    const [selectedFont, setSelectedFont] = useState(getSelectedFont());
    const [fontRevision, setFontRevision] = useState(0);
    const [captionHeight, setCaptionHeight] = useState(() => size + 10);
    const [viewport, setViewport] = useState(getViewportSize);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const onSubmitRef = useRef(onSubmit);

    const applyMediaDimensions = (width: number, height: number) => {
        if (width > 0) {
            setMediaWidth(width);
            if (!hasCustomSize) setSize(getDefaultFontSize(width));
        }

        if (height > 0) setMediaHeight(height);
    };

    const previewMetrics = useMemo(() => {
        const maxWidth = Math.max(180, Math.min(MAX_PREVIEW_WIDTH, viewport.width - PREVIEW_HORIZONTAL_MARGIN));
        const maxHeight = Math.max(160, viewport.height - PREVIEW_VERTICAL_CHROME);
        const totalHeight = mediaHeight + captionHeight;
        const scale = Math.min(1, maxWidth / mediaWidth, maxHeight / totalHeight);

        return {
            captionHeight: Math.max(1, Math.floor(captionHeight * scale)),
            mediaHeight: Math.max(1, Math.floor(mediaHeight * scale)),
            width: Math.max(1, Math.floor(mediaWidth * scale))
        };
    }, [captionHeight, mediaHeight, mediaWidth, viewport.height, viewport.width]);

    useEffect(() => {
        onSubmitRef.current = onSubmit;
    }, [onSubmit]);

    useEffect(() => {
        onSubmitRef.current(() => ({
            height: mediaHeight,
            fontFamily: selectedFont,
            sourceVideo: videoRef.current,
            text,
            size,
            type: "caption",
            width: mediaWidth
        }));
    }, [mediaHeight, mediaWidth, selectedFont, size, text]);

    useEffect(() => {
        applyMediaDimensions(media.width, media.height);
    }, [media.height, media.width, hasCustomSize]);

    useEffect(() => {
        const handleResize = () => setViewport(getViewportSize());

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(timeoutId);
    }, []);

    useEffect(() => {
        void loadGoogleFont(selectedFont).then(() => {
            setFontRevision(revision => revision + 1);
        });
    }, [selectedFont]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const previewText = text || "Enter caption...";
        const previewWidth = Math.max(1, mediaWidth);
        ctx.font = getCanvasFont(size, selectedFont);
        const lines = getLines(ctx, previewText, previewWidth);
        const captionHeight = lines.length * size + 10;

        canvas.width = previewWidth;
        canvas.height = captionHeight;
        setCaptionHeight(captionHeight);

        ctx.font = getCanvasFont(size, selectedFont);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, previewWidth, captionHeight);
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], previewWidth / 2, size * i + 5);
        }
    }, [fontRevision, mediaWidth, selectedFont, size, text]);

    return (
        <div className={cl("editor")}>
            <input
                ref={inputRef}
                className={cl("caption")}
                onChange={event => setText(event.target.value)}
                placeholder="Enter caption..."
            />
            <div className={cl("range")}>
                <div>Font</div>
                <div className={cl("font-selector")}>
                    <FontSelector
                        onSelect={font => {
                            setSelectedFont(font.family);
                            void loadGoogleFont(font.family);
                        }}
                    />
                </div>
            </div>
            <div className={cl("range")}>
                <div>Font size</div>
                <input
                    type="range"
                    min={5}
                    max={200}
                    value={size}
                    onChange={event => {
                        setHasCustomSize(true);
                        setSize(Number.parseFloat(event.target.value));
                    }}
                />
            </div>
            <div className={cl("preview-stack")} style={{ width: previewMetrics.width }}>
                <canvas
                    ref={canvasRef}
                    className={cl("preview-canvas")}
                    style={{
                        height: previewMetrics.captionHeight,
                        width: previewMetrics.width
                    }}
                />
                <div
                    className={cl("preview-media")}
                    style={{
                        height: previewMetrics.mediaHeight,
                        width: previewMetrics.width
                    }}
                >
                    {media.isVideo ? (
                        <video
                            ref={videoRef}
                            autoPlay
                            loop
                            muted
                            playsInline
                            src={media.url}
                            className={cl("media-element")}
                            onLoadedMetadata={event => {
                                const { videoWidth, videoHeight } = event.currentTarget;
                                applyMediaDimensions(videoWidth, videoHeight);
                            }}
                        />
                    ) : (
                        <img
                            alt="GIF preview"
                            src={media.url}
                            className={cl("media-element")}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
