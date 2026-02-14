/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { Parser, React } from "@webpack/common";

import type { MessagePreview as MessagePreviewData } from "../types";

const cl = classNameFactory("vc-chatbubble-");

interface MessagePreviewProps {
    preview: MessagePreviewData;
    bubbleSize: number;
    bubblePosition: { x: number; y: number };
    senderName: string;
    onClick: () => void;
}

export function MessagePreview({ preview, bubbleSize, bubblePosition, senderName, onClick }: MessagePreviewProps) {
    const previewRef = React.useRef<HTMLDivElement>(null);
    const [previewSize, setPreviewSize] = React.useState({ width: 160, height: 0 });
    const offset = 10, padding = 10;
    const displaySenderName = preview.senderName || senderName;

    const getMediaSize = React.useCallback(() => {
        if (!preview.media) return null;

        const maxWidth = 240;
        const maxHeight = 160;
        const width = preview.media.width ?? maxWidth;
        const height = preview.media.height ?? maxHeight;

        if (!width || !height) {
            return { width: maxWidth, height: maxHeight };
        }

        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        return {
            width: Math.max(120, Math.round(width * ratio)),
            height: Math.max(90, Math.round(height * ratio))
        };
    }, [preview.media]);

    React.useEffect(() => {
        const syncPreviewSize = () => {
            if (!previewRef.current) return;
            const { width, height } = previewRef.current.getBoundingClientRect();
            const next = { width: Math.round(width), height: Math.round(height) };
            setPreviewSize(prev =>
                prev.width === next.width && prev.height === next.height ? prev : next
            );
        };

        syncPreviewSize();
        window.addEventListener("resize", syncPreviewSize);
        return () => window.removeEventListener("resize", syncPreviewSize);
    }, [preview.content, preview.media, displaySenderName]);

    const rightLeft = bubblePosition.x + bubbleSize + offset;
    const left = rightLeft + previewSize.width > window.innerWidth - padding
        ? Math.max(padding, bubblePosition.x - previewSize.width - offset)
        : rightLeft;
    const top = clamp(
        bubblePosition.y + bubbleSize / 2 - previewSize.height / 2,
        padding,
        Math.max(padding, window.innerHeight - previewSize.height - padding)
    );
    const mediaSize = getMediaSize();
    const showContent = preview.content.length > 0;

    return (
        <div
            ref={previewRef}
            className={cl("message-preview", preview.media && "message-preview-has-media")}
            style={{
                left: `${left}px`,
                top: `${top}px`
            }}
            onClick={onClick}
        >
            <div className={cl("message-preview-sender")}>{displaySenderName}</div>
            {preview.media && mediaSize && (
                <div
                    className={cl("message-preview-media-wrap")}
                    style={{ width: `${mediaSize.width}px`, height: `${mediaSize.height}px` }}
                >
                    {preview.media.kind === "video" ? (
                        <video
                            className={cl("message-preview-media")}
                            src={preview.media.src}
                            poster={preview.media.posterSrc}
                            preload="metadata"
                            muted
                            playsInline
                        />
                    ) : (
                        <img
                            className={cl("message-preview-media")}
                            src={preview.media.src}
                            alt=""
                            loading="lazy"
                        />
                    )}
                </div>
            )}
            {showContent && (
                <div className={cl("message-preview-content")}>{Parser.parseInlineReply(preview.content)}</div>
            )}
        </div>
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}
