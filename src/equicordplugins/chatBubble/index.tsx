/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import ErrorBoundary from "@components/ErrorBoundary";
import { EquicordDevs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { findCssClassesLazy } from "@webpack";
import {
    ChannelStore,
    GuildStore,
    IconUtils,
    Menu,
    React,
    ReactDOM,
    ReadStateStore,
    RestAPI,
    UserStore
} from "@webpack/common";

import { BubbleContainer } from "./components/BubbleContainer";
import { useBubbleState } from "./hooks/useBubbleState";
import type { BubblePosition, ChatBubbleData, MessagePreview, PreviewMedia } from "./types";

const settings = definePluginSettings({
    enableAnimations: {
        type: OptionType.BOOLEAN,
        description: "Animate chat window opening/closing",
        default: true
    },
    bubbleSize: {
        type: OptionType.SLIDER,
        description: "Bubble size (pixels)",
        default: 60,
        markers: makeRange(40, 100, 10),
        stickToMarkers: true
    },
    avatarRing: {
        type: OptionType.BOOLEAN,
        description: "Show glow ring around avatars",
        default: true
    },
    maxBubbles: {
        type: OptionType.NUMBER,
        description: "Maximum number of bubbles",
        default: 5
    },
    enableTrashZone: {
        type: OptionType.BOOLEAN,
        description: "Show trash zone for removing bubbles",
        default: true
    },
    autoCreateBubbles: {
        type: OptionType.BOOLEAN,
        description: "Automatically create bubbles for incoming DM messages",
        default: false
    }
});

let bubbleManager: BubbleManager | null = null;
let chatBarStyle: HTMLStyleElement | null = null;
let autoCreateTimeouts: number[] = [];

const ChannelTextAreaClasses = findCssClassesLazy("buttonContainer", "button");
const ChatContentClasses = findCssClassesLazy("chatContent");

function updateChatBarStyle() {
    if (!chatBarStyle) return;

    const containerClass = ChannelTextAreaClasses?.buttonContainer;
    const buttonClass = ChannelTextAreaClasses?.button;
    const chatContentClass = ChatContentClasses?.chatContent;

    const rules: string[] = [];

    if (containerClass) {
        const selector = `.${containerClass.split(" ").join(".")}`;
        rules.push(`.vc-chatbubble-chat-window ${selector} { opacity: 1 !important; }`);
    }
    if (buttonClass) {
        const selector = `.${buttonClass.split(" ").join(".")}`;
        rules.push(`.vc-chatbubble-chat-window ${selector} { opacity: 1 !important; }`);
    }
    if (chatContentClass) {
        const selector = `.${chatContentClass.split(" ").join(".")}`;
        rules.push(`.vc-chatbubble-chat-window ${selector} { background: transparent !important; background-image: none !important; }`);
    }

    chatBarStyle.textContent = rules.join("\n");
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function getScreenBounds() {
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

function getSafeBubblePosition(position: BubblePosition, bubbleSize: number): BubblePosition {
    const { width, height } = getScreenBounds();
    const padding = 10;
    const maxX = Math.max(padding, width - bubbleSize - padding);
    const maxY = Math.max(padding, height - bubbleSize - padding);

    return {
        x: clamp(position.x, padding, maxX),
        y: clamp(position.y, padding, maxY)
    };
}

function getSnappedBubbleSize(value: number) {
    return clamp(Math.round(value / 10) * 10, 40, 100);
}

function getFallbackAvatarUrl(id?: string) {
    return id ? IconUtils.getDefaultAvatarURL(id) ?? "" : "";
}

interface PreviewAttachment {
    content_type?: string;
    filename?: string;
    height?: number;
    proxy_url?: string;
    url?: string;
    width?: number;
}

interface PreviewEmbedMedia {
    height?: number;
    proxy_url?: string;
    proxyURL?: string;
    url?: string;
    width?: number;
}

interface PreviewEmbed {
    description?: string;
    image?: PreviewEmbedMedia | null;
    title?: string;
    thumbnail?: PreviewEmbedMedia | null;
    type?: string;
    url?: string;
    video?: PreviewEmbedMedia | null;
}

interface PreviewMessage {
    attachments?: PreviewAttachment[];
    author?: {
        global_name?: string;
        globalName?: string;
        id?: string;
        username?: string;
    };
    content?: string;
    embeds?: PreviewEmbed[];
    mentions?: Array<{
        global_name?: string;
        globalName?: string;
        id: string;
        username?: string;
    }>;
}

function getPreviewMediaUrl(media?: PreviewEmbedMedia | null) {
    return media?.proxyURL || media?.proxy_url || media?.url || "";
}

function resolvePreviewMediaFromAttachments(attachments: PreviewAttachment[] = []): PreviewMedia | undefined {
    for (const attachment of attachments) {
        const contentType = attachment.content_type || "";
        const src = attachment.proxy_url || attachment.url;
        if (!src) continue;

        if (contentType.startsWith("image/")) {
            return {
                kind: "image",
                src,
                width: attachment.width,
                height: attachment.height
            };
        }

        if (contentType.startsWith("video/")) {
            return {
                kind: "video",
                src,
                width: attachment.width,
                height: attachment.height
            };
        }
    }
}

function resolvePreviewMediaFromEmbeds(embeds: PreviewEmbed[] = []): PreviewMedia | undefined {
    for (const embed of embeds) {
        const videoSrc = getPreviewMediaUrl(embed.video) || (embed.type === "gifv" ? embed.url || "" : "");
        if (videoSrc) {
            const fallbackImage = embed.thumbnail || embed.image;
            return {
                kind: "video",
                src: videoSrc,
                width: embed.video?.width ?? fallbackImage?.width,
                height: embed.video?.height ?? fallbackImage?.height,
                posterSrc: getPreviewMediaUrl(fallbackImage) || undefined
            };
        }

        const image = embed.image || embed.thumbnail;
        const imageSrc = getPreviewMediaUrl(image);
        if (imageSrc) {
            return {
                kind: "image",
                src: imageSrc,
                width: image?.width,
                height: image?.height
            };
        }
    }
}

function formatPreviewContent(rawContent: string, message: PreviewMessage) {
    return rawContent.replace(/<@!?(\d{17,20})>/g, (_, id: string) => {
        const mention = message.mentions?.find(m => m.id === id);
        const user = UserStore.getUser(id);
        const name = mention?.globalName
            || mention?.global_name
            || mention?.username
            || user?.globalName
            || user?.username
            || "unknown-user";

        return `@${name}`;
    });
}

function getEmbedPreviewText(embeds: PreviewEmbed[] = []) {
    for (const embed of embeds) {
        const title = embed.title?.trim();
        const description = embed.description?.trim();

        if (title && description) {
            return `${title}: ${description}`;
        }
        if (title) {
            return title;
        }
        if (description) {
            return description;
        }
    }

    return embeds.length > 0 ? "[Embed]" : "";
}

function buildMessagePreviewData(message: PreviewMessage) {
    const content = formatPreviewContent(message.content?.trim() || "", message);
    const media = resolvePreviewMediaFromAttachments(message.attachments) || resolvePreviewMediaFromEmbeds(message.embeds);
    const embedContent = getEmbedPreviewText(message.embeds);

    if (content) {
        return { content, media };
    }

    if (embedContent && embedContent !== "[Embed]") {
        return { content: embedContent, media };
    }

    if (media) {
        return { content: embedContent === "[Embed]" ? "" : embedContent, media };
    }

    if (embedContent) {
        return { content: embedContent, media };
    }

    const nonMediaAttachment = message.attachments?.find(a => {
        const contentType = a.content_type || "";
        return !contentType.startsWith("image/") && !contentType.startsWith("video/");
    });

    if (nonMediaAttachment?.filename) {
        return { content: `[Attachment: ${nonMediaAttachment.filename}]`, media };
    }

    return { content: "[Attachment]", media };
}

function getPreviewSenderName(message: PreviewMessage, channelId: string, fallbackName: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel || channel.isDM()) {
        return fallbackName;
    }

    const channelName = channel.name || fallbackName;
    const authorName = message.author?.globalName || message.author?.global_name || message.author?.username;
    return authorName ? `${channelName} - ${authorName}` : channelName;
}

class BubbleManager {
    private bubbleState: ReturnType<typeof useBubbleState> | null = null;

    setBubbleState(state: ReturnType<typeof useBubbleState>) {
        this.bubbleState = state;
    }

    addBubble(bubble: ChatBubbleData) {
        if (this.bubbleState) {
            this.bubbleState.addBubble(bubble);
        }
    }

    removeBubble(id: string) {
        if (this.bubbleState) {
            this.bubbleState.removeBubble(id);
        }
    }

    updateBubble(id: string, updates: Partial<ChatBubbleData>) {
        if (this.bubbleState) {
            this.bubbleState.updateBubble(id, updates);
        }
    }

    getBubbles(): ChatBubbleData[] {
        if (!this.bubbleState) return [];
        return this.bubbleState.bubbles;
    }

    addMessagePreview(preview: MessagePreview) {
        if (this.bubbleState) {
            this.bubbleState.addMessagePreview(preview);
        }
    }
}

function BubbleContainerWrapper() {
    const bubbleState = useBubbleState();

    React.useEffect(() => {
        if (bubbleManager) {
            bubbleManager.setBubbleState(bubbleState);
        }
    }, [bubbleState]);

    return (
        <BubbleContainer
            settings={settings.store}
            bubbles={bubbleState.bubbles}
            removeBubble={bubbleState.removeBubble}
            updateBubble={bubbleState.updateBubble}
            messagePreviews={bubbleState.messagePreviews}
        />
    );
}

function BubblePortal() {
    return ReactDOM.createPortal(<BubbleContainerWrapper />, document.body);
}

function findDmChannelByUserId(userId: string) {
    return ChannelStore.getSortedPrivateChannels().find(ch => ch.isDM() && ch.recipients!.includes(userId));
}

function createBubbleFromChannel(channelId: string, userId?: string) {
    if (!bubbleManager) return;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return;

    const bubbles = bubbleManager.getBubbles();
    const existingBubble = bubbles.find(b => b.channelId === channelId);
    if (existingBubble) {
        const safePosition = getSafeBubblePosition(existingBubble.position, settings.store.bubbleSize);
        const hasMoved = safePosition.x !== existingBubble.position.x || safePosition.y !== existingBubble.position.y;

        const { avatarUrl: existingAvatarUrl } = existingBubble;
        let avatarUrl = existingAvatarUrl;
        if (!avatarUrl) {
            if (channel.icon) {
                avatarUrl = `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.png`;
            } else if (channel.guild_id) {
                const guild = GuildStore.getGuild(channel.guild_id);
                if (guild?.icon) {
                    avatarUrl = IconUtils.getGuildIconURL({
                        id: guild.id,
                        icon: guild.icon,
                        canAnimate: true,
                        size: 128
                    }) || "";
                }
            }
            if (!avatarUrl) {
                avatarUrl = getFallbackAvatarUrl(channel.guild_id || channel.id);
            }
        }

        bubbleManager.updateBubble(existingBubble.id, {
            position: hasMoved ? safePosition : existingBubble.position,
            avatarUrl,
            unreadCount: ReadStateStore.getUnreadCount(channelId)
        });
        return;
    }

    if (bubbles.length >= settings.store.maxBubbles) return;

    const unreadCount = ReadStateStore.getUnreadCount(channelId);

    let avatarUrl = "";
    let name = "";

    if (channel.isDM()) {
        const recipientId = userId || channel.recipients![0];
        if (recipientId) {
            const recipient = UserStore.getUser(recipientId);
            if (recipient) {
                avatarUrl = recipient.getAvatarURL(undefined, 128, false) || getFallbackAvatarUrl(recipient.id);
                name = recipient.username || recipient.globalName || "Unknown";
            } else {
                avatarUrl = getFallbackAvatarUrl(recipientId);
                name = `User ${recipientId}`;
            }
        }
    } else if (channel.isGroupDM()) {
        name = channel.name || "Group DM";
        if (channel.icon) {
            avatarUrl = `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.png`;
        }
        if (!avatarUrl) {
            avatarUrl = getFallbackAvatarUrl(channel.id);
        }
    } else if (channel.guild_id) {
        name = channel.name || "Unknown Channel";
        if (channel.icon) {
            avatarUrl = `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.png`;
        }
        if (!avatarUrl) {
            const guild = GuildStore.getGuild(channel.guild_id);
            if (guild?.icon) {
                avatarUrl = IconUtils.getGuildIconURL({
                    id: guild.id,
                    icon: guild.icon,
                    canAnimate: true,
                    size: 128
                }) || "";
            }
        }
        if (!avatarUrl) {
            avatarUrl = getFallbackAvatarUrl(channel.guild_id || channel.id);
        }
    }

    if (!name) return;

    const defaultPosition = getSafeBubblePosition(
        { x: 20, y: 100 + (bubbles.length * 70) },
        settings.store.bubbleSize
    );

    const bubble: ChatBubbleData = {
        id: `bubble-${Date.now()}`,
        channelId: channel.id,
        guildId: channel.guild_id,
        avatarUrl,
        name,
        unreadCount,
        position: defaultPosition,
        createdAt: Date.now()
    };

    bubbleManager.addBubble(bubble);
}

export default definePlugin({
    name: "ChatBubble",
    description: "Facebook Messenger-style chat head bubbles for Discord channels",
    authors: [EquicordDevs.benjii],
    settings,

    flux: {
        MESSAGE_CREATE({ message }) {
            if (!bubbleManager) return;

            const bubbles = bubbleManager.getBubbles();
            const bubble = bubbles.find(b => b.channelId === message.channel_id);

            if (bubble) {
                const unreadCount = ReadStateStore.getUnreadCount(message.channel_id);
                bubbleManager.updateBubble(bubble.id, { unreadCount });

                const { content, media } = buildMessagePreviewData(message);
                const senderName = getPreviewSenderName(message, message.channel_id, bubble.name);

                bubbleManager.addMessagePreview({
                    bubbleId: bubble.id,
                    content,
                    senderName,
                    media,
                    timestamp: Date.now()
                });
            } else if (settings.store.autoCreateBubbles) {
                const channel = ChannelStore.getChannel(message.channel_id);
                if (!channel || !channel.isDM()) return;

                const { id: currentUserId } = UserStore.getCurrentUser();
                if (message.author.id === currentUserId) return;

                if (bubbles.length >= settings.store.maxBubbles) return;

                createBubbleFromChannel(message.channel_id, message.author.id);

                const timeoutId = window.setTimeout(() => {
                    autoCreateTimeouts = autoCreateTimeouts.filter(id => id !== timeoutId);
                    if (!bubbleManager) return;
                    const newBubbles = bubbleManager.getBubbles();
                    const newBubble = newBubbles.find(b => b.channelId === message.channel_id);
                    if (newBubble) {
                        const { content, media } = buildMessagePreviewData(message);
                        const senderName = getPreviewSenderName(message, message.channel_id, newBubble.name);
                        bubbleManager.addMessagePreview({
                            bubbleId: newBubble.id,
                            content,
                            senderName,
                            media,
                            timestamp: Date.now()
                        });
                    }
                }, 100);
                autoCreateTimeouts.push(timeoutId);
            }
        },

        CHANNEL_SELECT({ channelId }) {
            if (!bubbleManager || !channelId) return;

            const bubbles = bubbleManager.getBubbles();
            const bubble = bubbles.find(b => b.channelId === channelId);

            if (bubble) {
                bubbleManager.updateBubble(bubble.id, { unreadCount: 0 });
            }
        }
    },

    contextMenus: {
        "channel-context": (children, { channel }) => {
            const manager = bubbleManager;
            if (!channel || !manager) return;

            const menuChildren = Array.isArray(children) ? children : [children];

            const existingBubble = manager.getBubbles().find(b => b.channelId === channel.id);
            const label = existingBubble ? "Remove Chat Bubble" : "Create Chat Bubble";
            const action = existingBubble
                ? () => manager.removeBubble(existingBubble.id)
                : () => createBubbleFromChannel(channel.id);

            menuChildren.push(
                <Menu.MenuItem
                    id="toggle-chat-bubble"
                    label={label}
                    action={action}
                />
            );
        },

        "user-context": (children, { user }) => {
            const manager = bubbleManager;
            if (!user || !manager) return;

            const menuChildren = Array.isArray(children) ? children : [children];

            const dmChannel = findDmChannelByUserId(user.id);
            const existingBubble = dmChannel
                ? manager.getBubbles().find(b => b.channelId === dmChannel.id)
                : null;
            const label = existingBubble ? "Remove Chat Bubble" : "Create Chat Bubble";

            menuChildren.push(
                <Menu.MenuItem
                    id="toggle-chat-bubble-dm"
                    label={label}
                    action={async () => {
                        if (existingBubble) {
                            manager.removeBubble(existingBubble.id);
                            return;
                        }

                        const dmChan = findDmChannelByUserId(user.id);

                        if (!dmChan) {
                            let channelId = ChannelStore.getDMFromUserId(user.id);
                            if (!channelId) {
                                try {
                                    const response = await RestAPI.post({
                                        url: "/users/@me/channels",
                                        body: { recipients: [user.id] }
                                    });
                                    channelId = response.body.id;
                                    if (!channelId) return;
                                } catch {
                                    return;
                                }
                            }
                            createBubbleFromChannel(channelId, user.id);
                        } else {
                            createBubbleFromChannel(dmChan.id, user.id);
                        }
                    }}
                />
            );
        }
    },

    start() {
        const snappedBubbleSize = getSnappedBubbleSize(settings.store.bubbleSize);
        if (settings.store.bubbleSize !== snappedBubbleSize) {
            settings.store.bubbleSize = snappedBubbleSize;
        }

        bubbleManager = new BubbleManager();
        chatBarStyle = createAndAppendStyle("VcChatBubbleChatBar", managedStyleRootNode);
        updateChatBarStyle();
        addServerListElement(ServerListRenderPosition.Above, this.renderBubbleLayer);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, this.renderBubbleLayer);
        chatBarStyle?.remove();
        chatBarStyle = null;
        autoCreateTimeouts.forEach(id => clearTimeout(id));
        autoCreateTimeouts = [];
        bubbleManager = null;
    },

    renderBubbleLayer() {
        return (
            <ErrorBoundary noop>
                <BubblePortal />
            </ErrorBoundary>
        );
    }
});
