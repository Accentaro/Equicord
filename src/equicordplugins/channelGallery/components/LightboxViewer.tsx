/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { React, useEffect } from "@webpack/common";

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
        <div
            style={{
                position: "relative",
                height: "100%",
                width: "100%",
                background: "var(--background-primary)"
            }}
        >

            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12
                }}
            >
                {/* Click zones for prev/next (match Discord viewer UX) */}
                <div
                    onClick={() => hasPrev && onChangeIndex(prevIndex)}
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "50%",
                        cursor: hasPrev ? "w-resize" : "default",
                        pointerEvents: hasPrev ? "auto" : "none"
                    }}
                />
                <div
                    onClick={() => hasNext && onChangeIndex(nextIndex)}
                    style={{
                        position: "absolute",
                        inset: 0,
                        left: "50%",
                        width: "50%",
                        cursor: hasNext ? "e-resize" : "default",
                        pointerEvents: hasNext ? "auto" : "none"
                    }}
                />
                <img
                    src={url}
                    alt={item.filename ?? "Image"}
                    style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        width: "auto",
                        height: "auto",
                        objectFit: "contain",
                        borderRadius: 12,
                        background: "var(--background-secondary)"
                    }}
                />
            </div>

            <div
                style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 2
                }}
            >
                <button
                    disabled={!hasPrev}
                    onClick={() => hasPrev && onChangeIndex(prevIndex)}
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        border: "none",
                        background: hasPrev ? "var(--background-modifier-hover)" : "transparent",
                        cursor: hasPrev ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: hasPrev ? 1 : 0.3,
                        transition: "background-color 0.15s ease, opacity 0.15s ease"
                    }}
                    onMouseEnter={e => {
                        if (hasPrev) {
                            e.currentTarget.style.backgroundColor = "var(--control-icon-only-background-hover)";
                            const svg = e.currentTarget.querySelector("svg");
                            if (svg) svg.style.color = "var(--interactive-icon-hover)";
                        }
                    }}
                    onMouseLeave={e => {
                        if (hasPrev) {
                            e.currentTarget.style.backgroundColor = "var(--background-modifier-hover)";
                            const svg = e.currentTarget.querySelector("svg");
                            if (svg) svg.style.color = "var(--interactive-icon-default)";
                        }
                    }}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{
                            color: hasPrev ? "var(--interactive-icon-default)" : "var(--interactive-muted)",
                            transition: "color 0.15s ease"
                        }}
                    >
                        <path
                            d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z"
                            fill="currentColor"
                        />
                    </svg>
                </button>
            </div>
            <div
                style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 2
                }}
            >
                <button
                    disabled={!hasNext}
                    onClick={() => hasNext && onChangeIndex(nextIndex)}
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        border: "none",
                        background: hasNext ? "var(--background-modifier-hover)" : "transparent",
                        cursor: hasNext ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: hasNext ? 1 : 0.3,
                        transition: "background-color 0.15s ease, opacity 0.15s ease"
                    }}
                    onMouseEnter={e => {
                        if (hasNext) {
                            e.currentTarget.style.backgroundColor = "var(--control-icon-only-background-hover)";
                            const svg = e.currentTarget.querySelector("svg");
                            if (svg) svg.style.color = "var(--interactive-icon-hover)";
                        }
                    }}
                    onMouseLeave={e => {
                        if (hasNext) {
                            e.currentTarget.style.backgroundColor = "var(--background-modifier-hover)";
                            const svg = e.currentTarget.querySelector("svg");
                            if (svg) svg.style.color = "var(--interactive-icon-default)";
                        }
                    }}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{
                            color: hasNext ? "var(--interactive-icon-default)" : "var(--interactive-muted)",
                            transition: "color 0.15s ease"
                        }}
                    >
                        <path
                            d="M8.59 16.59L10 18L16 12L10 6L8.59 7.41L13.17 12L8.59 16.59Z"
                            fill="currentColor"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}
