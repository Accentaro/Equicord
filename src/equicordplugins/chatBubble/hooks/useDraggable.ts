/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useRef, useState } from "@webpack/common";

import type { BubblePosition, BubbleVelocity, DragState } from "../types";
import { calculateVelocity } from "../utils/physics";

const DRAG_THRESHOLD = 5;

export function useDraggable(
    initialPosition: BubblePosition,
    onDragEnd: (position: BubblePosition, velocity: BubbleVelocity) => void
) {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        startPos: initialPosition,
        currentPos: initialPosition,
        offset: { x: 0, y: 0 },
        velocity: { vx: 0, vy: 0 }
    });

    const lastPosRef = useRef(initialPosition);
    const lastTimeRef = useRef(Date.now());
    const isPointerDownRef = useRef(false);
    const hasCrossedThresholdRef = useRef(false);
    const pointerDownPosRef = useRef({ x: 0, y: 0 });
    const rafRef = useRef<number | null>(null);
    const pendingUpdateRef = useRef<{ pos: BubblePosition; velocity: BubbleVelocity; } | null>(null);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = e.currentTarget.getBoundingClientRect();
        const offset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        isPointerDownRef.current = true;
        hasCrossedThresholdRef.current = false;
        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

        setDragState(prev => ({
            ...prev,
            startPos: { x: rect.left, y: rect.top },
            currentPos: { x: rect.left, y: rect.top },
            offset
        }));

        lastPosRef.current = { x: rect.left, y: rect.top };
        lastTimeRef.current = Date.now();
    }, []);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!isPointerDownRef.current) return;

        if (!hasCrossedThresholdRef.current) {
            const dx = e.clientX - pointerDownPosRef.current.x;
            const dy = e.clientY - pointerDownPosRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < DRAG_THRESHOLD) {
                return;
            }

            hasCrossedThresholdRef.current = true;
            setDragState(prev => ({ ...prev, isDragging: true }));
        }

        const now = Date.now();
        const deltaTime = (now - lastTimeRef.current) / 1000;

        const newPos = {
            x: e.clientX - dragState.offset.x,
            y: e.clientY - dragState.offset.y
        };

        const velocity = calculateVelocity(lastPosRef.current, newPos, deltaTime);

        pendingUpdateRef.current = { pos: newPos, velocity };
        if (rafRef.current !== null) return;

        setDragState(prev => ({
            ...prev,
            currentPos: newPos,
            velocity
        }));

        lastPosRef.current = newPos;
        lastTimeRef.current = now;

        rafRef.current = requestAnimationFrame(() => {
            if (pendingUpdateRef.current) {
                const { pos, velocity } = pendingUpdateRef.current;
                setDragState(prev => ({
                    ...prev,
                    currentPos: pos,
                    velocity
                }));
                lastPosRef.current = pos;
                lastTimeRef.current = Date.now();
            }
            pendingUpdateRef.current = null;
            rafRef.current = null;
        });
    }, [dragState.offset]);

    const handlePointerUp = useCallback(() => {
        if (!isPointerDownRef.current) return;

        isPointerDownRef.current = false;
        const wasDragging = hasCrossedThresholdRef.current;
        hasCrossedThresholdRef.current = false;

        if (wasDragging) {
            setDragState(prev => ({ ...prev, isDragging: false }));
            onDragEnd(dragState.currentPos, dragState.velocity);
        } else {
            setDragState(prev => ({
                ...prev,
                isDragging: false,
                currentPos: dragState.startPos
            }));
        }
    }, [dragState.currentPos, dragState.velocity, dragState.startPos, onDragEnd]);

    useEffect(() => {
        if (isPointerDownRef.current) {
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);

            return () => {
                window.removeEventListener("pointermove", handlePointerMove);
                window.removeEventListener("pointerup", handlePointerUp);
                if (rafRef.current !== null) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                }
            };
        }
    }, [handlePointerMove, handlePointerUp]);

    return {
        position: dragState.currentPos,
        isDragging: dragState.isDragging,
        handlePointerDown
    };
}
