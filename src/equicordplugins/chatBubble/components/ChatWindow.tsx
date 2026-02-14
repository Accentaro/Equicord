/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { findByCodeLazy, findByPropsLazy, findComponentByCodeLazy, findCssClassesLazy } from "@webpack";
import { Avatar, ChannelStore, GuildStore, MessageActions, MessageStore, React, ScrollerThin, useStateFromStores } from "@webpack/common";

import type { ChatBubbleData } from "../types";

const Chat = findComponentByCodeLazy("filterAfterTimestamp:", "chatInputType");
const ChatInputTypes = findByPropsLazy("FORM", "NORMAL");
const ChannelRecord = findByCodeLazy("computeLurkerPermissionsAllowList(){");
const ChannelMessage = findComponentByCodeLazy("Message must not be a thread");
const messageClasses = findCssClassesLazy("message", "groupStart", "cozyMessage");
const cl = classNameFactory("vc-chatbubble-");

interface ChatWindowProps {
    bubble: ChatBubbleData;
    position: { x: number; y: number };
    bubbleSize: number;
    onSizeChange: (size: { width: number; height: number }) => void;
    isClosing?: boolean;
}

function ChatWindowComponent({ bubble, position, bubbleSize, onSizeChange, isClosing }: ChatWindowProps) {
    const windowRef = React.useRef<HTMLDivElement>(null);
    const bottomRef = React.useRef<HTMLDivElement>(null);
    const channel = ChannelStore.getChannel(bubble.channelId);
    React.useEffect(() => {
        if (!MessageStore.hasPresent(bubble.channelId)) {
            MessageActions.fetchMessages({ channelId: bubble.channelId, limit: 50 });
        }
    }, [bubble.channelId]);

    const messages = useStateFromStores([MessageStore], () => {
        const allMessages = MessageStore.getMessages(bubble.channelId);
        return [...allMessages?._array ?? []];
    }, [bubble.channelId]);

    const scrollToBottom = React.useCallback(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
    }, []);

    React.useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    React.useEffect(() => {
        const timer = setTimeout(scrollToBottom, 100);
        return () => clearTimeout(timer);
    }, [scrollToBottom]);

    React.useEffect(() => {
        let currentWidth = 0;
        let currentHeight = 0;

        const syncSize = () => {
            if (!windowRef.current) return;

            const { width, height } = windowRef.current.getBoundingClientRect();
            const nextWidth = Math.round(width);
            const nextHeight = Math.round(height);

            if (!nextWidth || !nextHeight) return;
            if (nextWidth === currentWidth && nextHeight === currentHeight) return;

            currentWidth = nextWidth;
            currentHeight = nextHeight;
            onSizeChange({ width: nextWidth, height: nextHeight });
        };

        syncSize();
        window.addEventListener("pointerup", syncSize);
        return () => window.removeEventListener("pointerup", syncSize);
    }, [onSizeChange]);

    if (!channel) return null;

    const guild = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;

    const dummyChannel = React.useMemo(() =>
        new ChannelRecord({
            id: bubble.channelId,
            guild_id: bubble.guildId,
            type: channel.type
        }),
        [bubble.channelId, bubble.guildId, channel.type]
    );

    const windowWidth = bubble.windowSize?.width ?? 360;
    const windowHeight = bubble.windowSize?.height ?? 400;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = position.x + bubbleSize + 15;
    let top = position.y;

    if (left + windowWidth > screenWidth) {
        left = position.x - windowWidth - 15;
    }
    if (left < 0) left = 10;
    if (top + windowHeight > screenHeight) {
        top = screenHeight - windowHeight - 10;
    }
    if (top < 0) top = 10;

    return (
        <div
            ref={windowRef}
            className={cl("chat-window", isClosing && "closing")}
            style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${windowWidth}px`,
                height: `${windowHeight}px`
            }}
        >
            <div className={cl("chat-window-header")}>
                <Avatar
                    src={bubble.avatarUrl}
                    size="SIZE_32"
                    className={cl("chat-window-avatar")}
                />
                <span className={cl("chat-window-name")}>{bubble.name}</span>
            </div>

            <div className={cl("chat-window-messages")}>
                {messages.length > 0 ? (
                    <ScrollerThin className={cl("chat-window-scroller")}>
                        {messages.map(msg => (
                            <ChannelMessage
                                key={msg.id}
                                className={classes(messageClasses?.message, messageClasses?.cozyMessage)}
                                id={`chat-bubble-msg-${msg.id}`}
                                groupId={msg.id}
                                message={msg}
                                channel={dummyChannel}
                                compact={false}
                            />
                        ))}
                        <div ref={bottomRef} />
                    </ScrollerThin>
                ) : (
                    <div className={cl("chat-window-empty")}>
                        No messages yet. Say hi!
                    </div>
                )}
            </div>

            <div className={cl("chat-window-chat-container")}>
                <Chat
                    channel={channel}
                    guild={guild}
                    chatInputType={ChatInputTypes.SIDEBAR ?? ChatInputTypes.NORMAL}
                />
            </div>
        </div>
    );
}

export const ChatWindow = ErrorBoundary.wrap(ChatWindowComponent, { noop: true });
