/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useEffect, useRef, useState } from "@webpack/common";

import { FontSelector, getSelectedFont, loadGoogleFont } from "../index";
import type { OnSubmit } from "../render/gifRenderer";
import { getLines } from "../utils/canvas";

export default function Captioner({ width, element, onSubmit }:
    { width: number, element: HTMLElement, onSubmit: OnSubmit }) {
    const [text, setText] = useState("");
    const [size, setSize] = useState(width / 10);
    const [selectedFont, setSelectedFont] = useState<string>(getSelectedFont());
    const input = useRef<HTMLInputElement | null>(null);
    const mediaWrapper = useRef<HTMLDivElement | null>(null);
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const ctx = useRef<CanvasRenderingContext2D | null>(null);

    const onSubmitRef = useRef(onSubmit);
    useEffect(() => {
        onSubmitRef.current = onSubmit;
    }, [onSubmit]);

    useEffect(() => {
        onSubmitRef.current(() => ({
            text,
            size,
            type: "caption"
        }));
    }, [text, size, selectedFont]);

    const render = () => {
        if (!canvas.current || !ctx.current) return;
        const lines = getLines(ctx.current, text || "Enter caption...", width);
        const captionHeight = lines.length * size + 10;

        // Add the image
        canvas.current.height = captionHeight;
        ctx.current.font = `${size}px ${selectedFont}`;
        ctx.current.fillStyle = "white";
        ctx.current.fillRect(0, 0, width, captionHeight);

        // Draw the caption
        ctx.current.textAlign = "center";
        ctx.current.textBaseline = "top";
        ctx.current.fillStyle = "black";
        for (let i = 0; i < lines.length; i++) {
            ctx.current.fillText(lines[i], width / 2, size * i + 5);
        }
    };

    useEffect(render, [text, size, selectedFont]);

    useEffect(() => {
        setTimeout(() => input.current?.focus(), 100);
        if (!mediaWrapper.current || !canvas.current) return;

        mediaWrapper.current.appendChild(element);
        mediaWrapper.current.style.width = "100%";
        mediaWrapper.current.style.maxWidth = `${width}px`;
        mediaWrapper.current.style.alignSelf = "center";
        if (canvas.current) {
            canvas.current.style.width = "100%";
            canvas.current.style.maxWidth = `${width}px`;
        }
        element.removeAttribute("width");
        element.removeAttribute("height");
        element.style.width = "100%";
        element.style.height = "auto";
        element.style.maxWidth = "100%";
        element.style.maxHeight = "100%";
        element.style.objectFit = "contain";
        element.style.display = "block";
        ctx.current = canvas.current.getContext("2d");
        render();
    }, []);

    return (
        <div className="gc-editor">
            <input onChange={e => setText(e.target.value)} ref={input}
            className="gc-caption" placeholder="Enter caption..." />
            <div className="gc-range">
                <div>Font</div>
                <div className="gc-font-selector">
                    <FontSelector
                        onSelect={font => {
                            setSelectedFont(font.family);
                            loadGoogleFont(font.family);
                        }}
                    />
                </div>
            </div>
            <div className="gc-range">
                <div>Font size</div>
                <input type="range" min={5} max={200} value={size}
                    onChange={e => setSize(parseFloat(e.target.value))} />
            </div>
            <div className="gc-preview-stack">
                <canvas width={width} ref={canvas} />
                <div className="gc-preview-media" ref={mediaWrapper} />
            </div>
        </div>
    );
}
