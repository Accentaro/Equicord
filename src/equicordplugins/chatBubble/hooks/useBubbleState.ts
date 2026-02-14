/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { useCallback, useEffect, useRef, useState } from "@webpack/common";

import type { ChatBubbleData, MessagePreview } from "../types";

const STORAGE_KEY = "chatBubble_activeBubbles";

export function useBubbleState() {
    const [bubbles, setBubbles] = useState<ChatBubbleData[]>([]);
    const [messagePreviews, setMessagePreviews] = useState<MessagePreview[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const previewTimeoutsRef = useRef<number[]>([]);

    useEffect(() => {
        DataStore.get(STORAGE_KEY).then(stored => {
            setBubbles(stored ?? []);
            setIsLoading(false);
        });
    }, []);

    useEffect(() => {
        if (!isLoading) {
            DataStore.set(STORAGE_KEY, bubbles);
        }
    }, [bubbles, isLoading]);

    useEffect(() => {
        return () => {
            previewTimeoutsRef.current.forEach(id => clearTimeout(id));
            previewTimeoutsRef.current = [];
        };
    }, []);

    const addBubble = useCallback((bubble: ChatBubbleData) => {
        setBubbles(prev => [...prev, bubble]);
    }, []);

    const removeBubble = useCallback((id: string) => {
        setBubbles(prev => prev.filter(b => b.id !== id));
    }, []);

    const updateBubble = useCallback((id: string, updates: Partial<ChatBubbleData>) => {
        setBubbles(prev => prev.map(b =>
            b.id === id ? { ...b, ...updates } : b
        ));
    }, []);

    const addMessagePreview = useCallback((preview: MessagePreview) => {
        setMessagePreviews(prev => [...prev, preview]);

        const timeoutId = window.setTimeout(() => {
            setMessagePreviews(prev => prev.filter(p => p.timestamp !== preview.timestamp));
            previewTimeoutsRef.current = previewTimeoutsRef.current.filter(id => id !== timeoutId);
        }, 5000);
        previewTimeoutsRef.current.push(timeoutId);
    }, []);

    return {
        bubbles,
        messagePreviews,
        addBubble,
        removeBubble,
        updateBubble,
        addMessagePreview
    };
}
