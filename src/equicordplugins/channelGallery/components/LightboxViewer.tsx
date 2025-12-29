/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { React, useEffect } from "@webpack/common";

import "../style.css";
const jumper: any = findByPropsLazy("jumpToMessage");
import type { GalleryItem } from "../utils/extractImages";

function preload(url: string) {
    const img = new Image();
    img.src = url;
}

export function LightboxViewer(props: {
    items: GalleryItem[];
    index: number;
    channelId: string;
    onClose(): void;
    onChangeIndex(nextIndex: number): void;
    onOpenMessage(): void;
}) {
    const { items, index, channelId, onClose, onChangeIndex } = props;
    const item = items[index];
    const url = item?.url;

    const hasPrev = index > 0;
    const hasNext = index < items.length - 1;

    const prevIndex = hasPrev ? index - 1 : index;
    const nextIndex = hasNext ? index + 1 : index;

    if (!item || !url) return null;

    const jump = () => {
        try {
            jumper.jumpToMessage({
                channelId,
                messageId: item.messageId,
                flash: true,
                jumpType: "INSTANT"
            });
        } finally {
            props.onOpenMessage();
        }
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            } else if (e.key === "ArrowLeft" && hasPrev) {
                e.preventDefault();
                onChangeIndex(prevIndex);
            } else if (e.key === "ArrowRight" && hasNext) {
                e.preventDefault();
                onChangeIndex(nextIndex);
            } else if (e.key === "Enter") {
                e.preventDefault();
                jump();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [hasNext, hasPrev, nextIndex, onChangeIndex, onClose, prevIndex, jump]);

    // Preload neighbors for smoother navigation.
    useEffect(() => {
        const prev = items[prevIndex];
        const next = items[nextIndex];
        if (prev?.url) preload(prev.url);
        if (next?.url) preload(next.url);
    }, [items, nextIndex, prevIndex]);

    return (
        <div className="vc-gallery-lightbox">
            <div className="vc-gallery-lightbox-content">
                {/* Click zones for prev/next (match Discord viewer UX) */}
                <div
                    onClick={() => hasPrev && onChangeIndex(prevIndex)}
                    className={`vc-gallery-lightbox-zone vc-gallery-lightbox-zone-left ${hasPrev ? "" : "vc-gallery-lightbox-zone-disabled"}`}
                />
                <div
                    onClick={() => hasNext && onChangeIndex(nextIndex)}
                    className={`vc-gallery-lightbox-zone vc-gallery-lightbox-zone-right ${hasNext ? "" : "vc-gallery-lightbox-zone-disabled"}`}
                />
                <img
                    src={url}
                    alt={item.filename ?? "Image"}
                    className="vc-gallery-lightbox-image"
                />
            </div>

            <button
                disabled={!hasPrev}
                onClick={() => hasPrev && onChangeIndex(prevIndex)}
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
                onClick={() => hasNext && onChangeIndex(nextIndex)}
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
