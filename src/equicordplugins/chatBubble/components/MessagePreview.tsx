/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";

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
    return (
        <div
            className={cl("message-preview")}
            style={{
                left: `${bubblePosition.x + bubbleSize + 10}px`,
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
