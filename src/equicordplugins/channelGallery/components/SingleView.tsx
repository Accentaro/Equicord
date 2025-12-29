/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { React, useEffect, useMemo } from "@webpack/common";

import type { GalleryItem } from "../utils/media";

const jumper: any = findByPropsLazy("jumpToMessage");

function preload(url: string): void {
    if (!url) return;
    const img = new Image();
    img.src = url;
}

export function SingleView(props: {
    items: GalleryItem[];
    selectedStableId: string;
    channelId: string;
    onClose(): void;
    onChange(stableId: string): void;
    onOpenMessage(): void;
}) {
    const { items, selectedStableId, channelId, onClose, onChange, onOpenMessage } = props;

    // Find index by stable ID
    const selectedIndex = useMemo(() => {
        if (!items || items.length === 0 || !selectedStableId) return -1;
        return items.findIndex(item => item?.stableId === selectedStableId);
    }, [items, selectedStableId]);

    // Early return if invalid
    if (selectedIndex < 0 || selectedIndex >= items.length) return null;

    const item = items[selectedIndex];
    if (!item || !item.url) return null;

    const hasPrev = selectedIndex > 0;
    const hasNext = selectedIndex < items.length - 1;

    const prevStableId = hasPrev && items[selectedIndex - 1] ? items[selectedIndex - 1].stableId : null;
    const nextStableId = hasNext && items[selectedIndex + 1] ? items[selectedIndex + 1].stableId : null;

    // Keyboard navigation
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            } else if (e.key === "ArrowLeft" && hasPrev && prevStableId) {
                e.preventDefault();
                onChange(prevStableId);
            } else if (e.key === "ArrowRight" && hasNext && nextStableId) {
                e.preventDefault();
                onChange(nextStableId);
            } else if (e.key === "Enter") {
                e.preventDefault();
                handleJump();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [hasPrev, hasNext, prevStableId, nextStableId, onClose, onChange]);

    // Preload neighbors
    useEffect(() => {
        if (!items || items.length === 0) return;
        const prev = hasPrev && items[selectedIndex - 1] ? items[selectedIndex - 1] : null;
        const next = hasNext && items[selectedIndex + 1] ? items[selectedIndex + 1] : null;
        if (prev?.url) preload(prev.url);
        if (next?.url) preload(next.url);
    }, [items, selectedIndex, hasPrev, hasNext]);

    const handleJump = () => {
        if (!item?.messageId) return;
        try {
            jumper.jumpToMessage({
                channelId,
                messageId: item.messageId,
                flash: true,
                jumpType: "INSTANT"
            });
        } finally {
            onOpenMessage();
        }
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (hasPrev && prevStableId) {
            onChange(prevStableId);
        }
    };

    const handleNext = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (hasNext && nextStableId) {
            onChange(nextStableId);
        }
    };

    return (
        <div className="vc-gallery-lightbox">
            <div className="vc-gallery-lightbox-content">
                <div
                    onClick={handlePrev}
                    className={`vc-gallery-lightbox-zone vc-gallery-lightbox-zone-left ${hasPrev ? "" : "vc-gallery-lightbox-zone-disabled"}`}
                />
                <div
                    onClick={handleNext}
                    className={`vc-gallery-lightbox-zone vc-gallery-lightbox-zone-right ${hasNext ? "" : "vc-gallery-lightbox-zone-disabled"}`}
                />
                <img
                    src={item.url}
                    alt={item.filename ?? "Image"}
                    className="vc-gallery-lightbox-image"
                />
            </div>

            <button
                disabled={!hasPrev}
                onClick={handlePrev}
                className="vc-gallery-nav-button vc-gallery-nav-button-left"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="vc-gallery-nav-icon"
                >
                    <path
                        d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z"
                        fill="currentColor"
                    />
                </svg>
            </button>
            <button
                disabled={!hasNext}
                onClick={handleNext}
                className="vc-gallery-nav-button vc-gallery-nav-button-right"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="vc-gallery-nav-icon"
                >
                    <path
                        d="M8.59 16.59L10 18L16 12L10 6L8.59 7.41L13.17 12L8.59 16.59Z"
                        fill="currentColor"
                    />
                </svg>
            </button>
        </div>
    );
}
