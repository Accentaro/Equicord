/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { ChannelStore, React, ReadStateUtils } from "@webpack/common";

import type { BubblePosition, BubbleVelocity, ChatBubbleData, MessagePreview } from "../types";
import { ChatBubble } from "./ChatBubble";
import { ChatWindow } from "./ChatWindow";
import { MessagePreview as MessagePreviewComponent } from "./MessagePreview";

const cl = classNameFactory("vc-chatbubble-");

interface AnchoredBubbleProps {
    bubble: ChatBubbleData;
    livePosition?: BubblePosition;
    messagePreview: MessagePreview | null;
    isChatOpen: boolean;
    enableAnimations: boolean;
    onBubbleClick: () => void;
    onBubbleHover: (isHovered: boolean) => void;
    onDragStart: () => void;
    onDragEnd: (pos: BubblePosition, vel: BubbleVelocity) => void;
    onDragMove: (pos: BubblePosition) => void;
    onPreviewClick: () => void;
    onWindowResize: (size: { width: number; height: number }) => void;
    bubbleSize: number;
}

function AnchoredBubbleComponent({
    bubble,
    livePosition,
    messagePreview,
    isChatOpen,
    enableAnimations,
    onBubbleClick,
    onBubbleHover,
    onDragStart,
    onDragEnd,
    onDragMove,
    onPreviewClick,
    onWindowResize,
    bubbleSize
}: AnchoredBubbleProps) {
    const anchorPosition = livePosition ?? bubble.position;
    const [isClosing, setIsClosing] = React.useState(false);
    const [shouldRender, setShouldRender] = React.useState(false);
    const timeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        if (isChatOpen && bubble.channelId) {
            const channel = ChannelStore.getChannel(bubble.channelId);
            if (channel) {
                ReadStateUtils.ackChannel(channel);
            }
        }
    }, [isChatOpen, bubble.channelId]);

    React.useEffect(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (isChatOpen) {
            setIsClosing(false);
            setShouldRender(true);
        } else if (shouldRender) {
            if (enableAnimations) {
                setIsClosing(true);
                timeoutRef.current = window.setTimeout(() => {
                    setShouldRender(false);
                    setIsClosing(false);
                    timeoutRef.current = null;
                }, 120);
            } else {
                setShouldRender(false);
                setIsClosing(false);
            }
        }

        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [isChatOpen, shouldRender, enableAnimations]);

    return (
        <div className={cl("anchored-container")}>
            <ChatBubble
                data={bubble}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragMove={onDragMove}
                onClick={onBubbleClick}
                onHoverChange={onBubbleHover}
                size={bubbleSize}
            />

            {messagePreview && !isChatOpen && (
                <MessagePreviewComponent
                    preview={messagePreview}
                    bubbleSize={bubbleSize}
                    bubblePosition={anchorPosition}
                    senderName={bubble.name}
                    onClick={onPreviewClick}
                />
            )}

            {shouldRender && (
                <ChatWindow
                    bubble={bubble}
                    position={anchorPosition}
                    bubbleSize={bubbleSize}
                    onSizeChange={onWindowResize}
                    isClosing={isClosing}
                />
            )}
        </div>
    );
}

export const AnchoredBubble = ErrorBoundary.wrap(AnchoredBubbleComponent, { noop: true });
