/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { React } from "@webpack/common";

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
    const [previewWidth, setPreviewWidth] = React.useState(160);
    const padding = 10;
    const offset = 10;
    let left = bubblePosition.x + bubbleSize + offset;

    React.useEffect(() => {
        const syncWidth = () => {
            if (!previewRef.current) return;
            const nextWidth = Math.round(previewRef.current.getBoundingClientRect().width);
            setPreviewWidth(prev => prev === nextWidth ? prev : nextWidth);
        };

        syncWidth();
        window.addEventListener("resize", syncWidth);
        return () => window.removeEventListener("resize", syncWidth);
    }, [preview.content, senderName]);

    if (left + previewWidth > window.innerWidth - padding) {
        left = bubblePosition.x - previewWidth - offset;
    }

    if (left < padding) {
        left = padding;
    }

    return (
        <div
            ref={previewRef}
            className={cl("message-preview")}
            style={{
                left: `${left}px`,
                top: `${bubblePosition.y + bubbleSize / 2}px`,
                transform: "translateY(-50%)"
            }}
            onClick={onClick}
        >
            <div className={cl("message-preview-sender")}>{senderName}</div>
            <div className={cl("message-preview-content")}>{preview.content}</div>
        </div>
    );
}
