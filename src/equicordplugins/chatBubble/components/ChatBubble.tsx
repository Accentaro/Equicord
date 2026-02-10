/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { React } from "@webpack/common";

import { useDraggable } from "../hooks/useDraggable";
import type { BubblePosition, BubbleVelocity, ChatBubbleData } from "../types";

const cl = classNameFactory("vc-chatbubble-");

interface ChatBubbleProps {
    data: ChatBubbleData;
    onDragStart: () => void;
    onDragEnd: (position: BubblePosition, velocity: BubbleVelocity) => void;
    onDragMove?: (position: BubblePosition) => void;
    onClick: () => void;
    onHoverChange?: (isHovered: boolean) => void;
    size: number;
}

export function ChatBubble({
    data,
    onDragStart,
    onDragEnd,
    onDragMove,
    onClick,
    onHoverChange,
    size
}: ChatBubbleProps) {
    const dragStartedRef = React.useRef(false);

    const { position, isDragging, handlePointerDown } = useDraggable(
        data.position,
        (pos, vel) => onDragEnd(pos, vel)
    );

    const finalPosition = isDragging ? position : data.position;

    const handleClick = (e: React.MouseEvent) => {
        if (dragStartedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            dragStartedRef.current = false;
            return;
        }

        onClick();
    };

    React.useEffect(() => {
        if (isDragging && !dragStartedRef.current) {
            dragStartedRef.current = true;
            onDragStart();
        } else if (!isDragging && dragStartedRef.current) {
            const timer = setTimeout(() => {
                dragStartedRef.current = false;
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isDragging, onDragStart]);

    React.useEffect(() => {
        if (!isDragging || !onDragMove) return;
        onDragMove(position);
    }, [isDragging, onDragMove, position.x, position.y]);

    return (
        <div
            className={cl("bubble", { dragging: isDragging })}
            style={{
                transform: `translate3d(${finalPosition.x}px, ${finalPosition.y}px, 0)`,
                width: `${size}px`,
                height: `${size}px`
            }}
            onPointerDown={handlePointerDown}
            onClick={handleClick}
            onMouseEnter={() => onHoverChange?.(true)}
            onMouseLeave={() => onHoverChange?.(false)}
        >
            <div className={cl("avatar-clip")}>
                <img
                    src={data.avatarUrl}
                    className={cl("avatar")}
                    alt={data.name}
                    width={size}
                    height={size}
                />
            </div>
            {data.unreadCount > 0 && (
                <div className={cl("badge")}>
                    {data.unreadCount > 99 ? "99+" : data.unreadCount}
                </div>
            )}
        </div>
    );
}
