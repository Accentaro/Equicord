/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface BubblePosition {
    x: number;
    y: number;
}

export interface BubbleVelocity {
    vx: number;
    vy: number;
}

export interface ChatBubbleData {
    id: string;
    channelId: string;
    guildId?: string;
    avatarUrl: string;
    name: string;
    unreadCount: number;
    position: BubblePosition;
    windowSize?: { width: number; height: number };
    createdAt: number;
}

export interface PreviewMedia {
    kind: "image" | "video";
    src: string;
    width?: number;
    height?: number;
    posterSrc?: string;
}

export interface MessagePreview {
    bubbleId: string;
    content: string;
    senderName?: string;
    media?: PreviewMedia;
    timestamp: number;
}

export interface DragState {
    isDragging: boolean;
    startPos: BubblePosition;
    currentPos: BubblePosition;
    offset: BubblePosition;
    velocity: BubbleVelocity;
}

export interface BubbleSettings {
    enableAnimations: boolean;
    bubbleSize: number;
    avatarRing: boolean;
    maxBubbles: number;
    enableTrashZone: boolean;
}
