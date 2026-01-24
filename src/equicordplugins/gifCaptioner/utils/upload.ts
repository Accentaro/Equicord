/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendMessage } from "@utils/discord";
import { type Channel,CloudUpload } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, SelectedChannelStore, SelectedGuildStore, UserStore } from "@webpack/common";

import { showError, showSent, showUploading } from "../ui/statusCard";

const CloudUploadConstructor = findLazy(m => m.prototype?.trackUploadFinished) as typeof CloudUpload;

function resolveThreadId(parentId: string, candidateId?: string | null): string | null {
    if (!candidateId) return null;
    const candidate = ChannelStore.getChannel(candidateId) as Channel | undefined;
    if (!candidate || candidate.parent_id !== parentId) return null;
    return candidate.isThread() || candidate.isForumPost() ? candidate.id : null;
}

function resolveUploadChannelId(selectedChannelId: string | null): string | null {
    if (!selectedChannelId) return null;

    const channel = ChannelStore.getChannel(selectedChannelId) as Channel | undefined;
    if (!channel || !channel.isForumChannel()) return selectedChannelId;

    const guildId = SelectedGuildStore.getGuildId();
    const threadMatch = window.location.pathname.match(/\/threads\/(\d+)/);
    const pathMatch = window.location.pathname.match(/\/channels\/[^/]+\/([^/]+)/);
    const urlId = threadMatch?.[1] ?? pathMatch?.[1] ?? null;
    const candidates = [
        urlId,
        guildId ? SelectedChannelStore.getCurrentlySelectedChannelId(guildId) : null,
        guildId ? SelectedChannelStore.getMostRecentSelectedTextChannelId(guildId) : null,
        guildId ? SelectedChannelStore.getLastSelectedChannelId(guildId) : null,
    ];

    for (const candidateId of candidates) {
        const threadId = resolveThreadId(selectedChannelId, candidateId);
        if (threadId) return threadId;
    }

    return null;
}

export function uploadFile(file: File) {
    const selectedChannelId = SelectedChannelStore.getChannelId();
    const channelId = resolveUploadChannelId(selectedChannelId);
    if (!channelId) {
        const baseChannel = selectedChannelId
            ? ChannelStore.getChannel(selectedChannelId) as Channel | undefined
            : null;
        const errorMessage = baseChannel && baseChannel.isForumChannel()
            ? "Open a forum post to send a message"
            : "No channel selected";
        showError(errorMessage);
        return;
    }

    const upload = new CloudUploadConstructor({
        file,
        isThumbnail: false,
        platform: CloudUploadPlatform.WEB,
    }, channelId);

    upload.on("complete", () => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const currentUserId = UserStore.getCurrentUser()?.id ?? null;
        const cleanup = (handler: (data: any) => void) => {
            if (timeoutId) clearTimeout(timeoutId);
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", handler);
        };
        const handleMessageCreate = (data: any) => {
            const message = data?.message;
            if (!message || message.channel_id !== channelId) return;
            if (currentUserId && message.author?.id !== currentUserId) return;
            const hasAttachment = Array.isArray(message.attachments) && message.attachments.some((att: any) => (
                att?.filename === file.name || att?.size === file.size
            ));
            if (!hasAttachment) return;
            showSent();
            cleanup(handleMessageCreate);
        };
        FluxDispatcher.subscribe("MESSAGE_CREATE", handleMessageCreate);
        timeoutId = setTimeout(() => cleanup(handleMessageCreate), 15000);
        const result = sendMessage(channelId, {
            content: ""
        }, undefined, {
            attachmentsToUpload: [upload]
        });
        if (result && typeof (result as Promise<unknown>).then === "function") {
            (result as Promise<unknown>)
                .catch(() => showError("Failed to send message"));
            return;
        }
    });

    upload.on("error", () => showError("Failed to upload file"));

    showUploading();
    upload.upload();
}
