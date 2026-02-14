/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { React, useCallback, useState } from "@webpack/common";

import type { BubblePosition, BubbleSettings, ChatBubbleData, MessagePreview as MessagePreviewData } from "../types";
import { AnchoredBubble } from "./AnchoredBubble";
import { TrashZone } from "./TrashZone";

const cl = classNameFactory("vc-chatbubble-");

interface BubbleContainerProps {
    settings: BubbleSettings;
    bubbles: ChatBubbleData[];
    removeBubble: (id: string) => void;
    updateBubble: (id: string, updates: Partial<ChatBubbleData>) => void;
    messagePreviews: MessagePreviewData[];
}

export const BubbleContainer = ErrorBoundary.wrap(
    function BubbleContainer({ settings, bubbles, removeBubble, updateBubble, messagePreviews }: BubbleContainerProps) {
        const [isDragging, setIsDragging] = useState(false);
        const [activeChatBubbleId, setActiveChatBubbleId] = useState<string | null>(null);
        const [hoveredBubbleId, setHoveredBubbleId] = useState<string | null>(null);
        const [livePositions, setLivePositions] = useState<Record<string, BubblePosition>>({});
        const [lastSeenPreviews, setLastSeenPreviews] = useState<Record<string, MessagePreviewData>>({});

        const trashZoneY = window.innerHeight - 100;
        const magnetRadius = 75;

        React.useEffect(() => {
            setLastSeenPreviews(prev => {
                let next = prev;

                for (const preview of messagePreviews) {
                    if (next[preview.bubbleId]?.timestamp === preview.timestamp) {
                        continue;
                    }

                    if (next === prev) {
                        next = { ...prev };
                    }

                    next[preview.bubbleId] = preview;
                }

                return next;
            });
        }, [messagePreviews]);

        const handleDragStart = useCallback(() => {
            setIsDragging(true);
        }, []);

        const handleDragMove = useCallback((bubbleId: string, position: BubblePosition) => {
            setLivePositions(prev => ({
                ...prev,
                [bubbleId]: position
            }));
        }, []);

        const clearLivePosition = useCallback((bubbleId: string) => {
            setLivePositions(prev => {
                if (!prev[bubbleId]) return prev;
                const next = { ...prev };
                delete next[bubbleId];
                return next;
            });
        }, []);

        const handleDragEnd = useCallback((
            bubbleId: string,
            position: BubblePosition
        ) => {
            setIsDragging(false);
            const centerX = window.innerWidth / 2;
            const distanceToTrashZone = Math.hypot(position.x - centerX, position.y - trashZoneY);

            if (settings.enableTrashZone && distanceToTrashZone < magnetRadius) {
                removeBubble(bubbleId);
                clearLivePosition(bubbleId);
                return;
            }

            updateBubble(bubbleId, { position });
            clearLivePosition(bubbleId);
        }, [settings, removeBubble, updateBubble, trashZoneY, magnetRadius, clearLivePosition]);

        const handleBubbleClick = useCallback((bubbleId: string) => {
            setActiveChatBubbleId(prev => prev === bubbleId ? null : bubbleId);
        }, []);

        const handlePreviewClick = useCallback((bubbleId: string) => {
            setActiveChatBubbleId(bubbleId);
        }, []);

        const handleBubbleHover = useCallback((bubbleId: string, isHovered: boolean) => {
            setHoveredBubbleId(isHovered ? bubbleId : null);
        }, []);

        const handleWindowResize = useCallback((bubbleId: string, size: { width: number; height: number }) => {
            updateBubble(bubbleId, { windowSize: size });
        }, [updateBubble]);

        if (bubbles.length === 0) return null;

        return (
            <div className={cl("container", {
                "ring-enabled": settings.avatarRing,
                "animations-disabled": !settings.enableAnimations
            })}>
                {bubbles.map(bubble => {
                    const preview = messagePreviews.find(p => p.bubbleId === bubble.id);
                    const isChatOpen = activeChatBubbleId === bubble.id;
                    const livePosition = livePositions[bubble.id];
                    const isHovered = hoveredBubbleId === bubble.id;
                    const lastPreview = lastSeenPreviews[bubble.id];
                    const showPreviewOnHover = isHovered && lastPreview && !preview && !isChatOpen;

                    return (
                        <AnchoredBubble
                            key={bubble.id}
                            bubble={bubble}
                            livePosition={livePosition}
                            messagePreview={preview || (showPreviewOnHover ? lastPreview : null)}
                            isChatOpen={isChatOpen}
                            enableAnimations={settings.enableAnimations}
                            onBubbleClick={() => handleBubbleClick(bubble.id)}
                            onBubbleHover={hovered => handleBubbleHover(bubble.id, hovered)}
                            onDragStart={handleDragStart}
                            onDragEnd={pos => handleDragEnd(bubble.id, pos)}
                            onDragMove={pos => handleDragMove(bubble.id, pos)}
                            onPreviewClick={() => handlePreviewClick(bubble.id)}
                            onWindowResize={size => handleWindowResize(bubble.id, size)}
                            bubbleSize={settings.bubbleSize}
                        />
                    );
                })}

                <TrashZone
                    isActive={isDragging && settings.enableTrashZone}
                />
            </div>
        );
    },
    { noop: true }
);
