/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { MediaType } from "./types";

export const settings = definePluginSettings({
    hideUnsortedMedias: {
        type: OptionType.BOOLEAN,
        description: "Hide medias in the picker tab which are in a category",
        default: true,
    },
    hideThumbnail: {
        type: OptionType.BOOLEAN,
        description: "Show the category color instead of a media thumbnail",
        default: false,
    },
    allowCaching: {
        type: OptionType.BOOLEAN,
        description: "Allow medias preview caching (IndexedDB)",
        default: true,
    },
    mediaVolume: {
        type: OptionType.SLIDER,
        description: "Preview media volume",
        markers: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        default: 10,
        stickToMarkers: false,
    },
    maxMediasPerPage: {
        type: OptionType.SELECT,
        description: "The maximum amount of displayed medias per page in the picker tab",
        options: [
            { label: "20", value: 20 },
            { label: "50", value: 50, default: true },
            { label: "100", value: 100 },
        ],
    },

    gifEnabled: {
        type: OptionType.BOOLEAN,
        description: "Replace Discord GIFs Favorites view",
        default: true,
    },
    gifShowStar: {
        type: OptionType.BOOLEAN,
        description: "Show favorite star on medias",
        default: true,
    },
    gifAlwaysSendInstantly: {
        type: OptionType.BOOLEAN,
        description: "Send instantly medias links and/or files",
        default: true,
    },
    gifAlwaysUploadFile: {
        type: OptionType.BOOLEAN,
        description: "Uploads media as file instead of sending a link",
        default: false,
    },

    imageEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable image favoriting",
        default: true,
    },
    imageShowBtn: {
        type: OptionType.BOOLEAN,
        description: "Show button on chat",
        default: true,
    },
    imageShowStar: {
        type: OptionType.BOOLEAN,
        description: "Show favorite star on medias",
        default: true,
    },
    imageAlwaysSendInstantly: {
        type: OptionType.BOOLEAN,
        description: "Send instantly medias links and/or files",
        default: true,
    },
    imageAlwaysUploadFile: {
        type: OptionType.BOOLEAN,
        description: "Uploads media as file instead of sending a link",
        default: false,
    },

    videoEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable video favoriting",
        default: true,
    },
    videoShowBtn: {
        type: OptionType.BOOLEAN,
        description: "Show button on chat",
        default: true,
    },
    videoShowStar: {
        type: OptionType.BOOLEAN,
        description: "Show favorite star on medias",
        default: true,
    },
    videoAlwaysSendInstantly: {
        type: OptionType.BOOLEAN,
        description: "Send instantly medias links and/or files",
        default: true,
    },
    videoAlwaysUploadFile: {
        type: OptionType.BOOLEAN,
        description: "Uploads media as file instead of sending a link",
        default: false,
    },

    audioEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable audio favoriting",
        default: true,
    },
    audioShowBtn: {
        type: OptionType.BOOLEAN,
        description: "Show button on chat",
        default: true,
    },
    audioShowStar: {
        type: OptionType.BOOLEAN,
        description: "Show favorite star on medias",
        default: true,
    },
    audioAlwaysSendInstantly: {
        type: OptionType.BOOLEAN,
        description: "Send instantly medias links and/or files",
        default: true,
    },
    audioAlwaysUploadFile: {
        type: OptionType.BOOLEAN,
        description: "Uploads media as file instead of sending a link",
        default: false,
    },

    fileEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable file favoriting",
        default: true,
    },
    fileShowBtn: {
        type: OptionType.BOOLEAN,
        description: "Show button on chat",
        default: true,
    },
    fileShowStar: {
        type: OptionType.BOOLEAN,
        description: "Show favorite star on medias",
        default: true,
    },
    fileAlwaysSendInstantly: {
        type: OptionType.BOOLEAN,
        description: "Send instantly medias links and/or files",
        default: true,
    },
    fileAlwaysUploadFile: {
        type: OptionType.BOOLEAN,
        description: "Uploads media as file instead of sending a link",
        default: false,
    },
});

export function getPerTypeSettings(type: MediaType) {
    switch (type) {
        case "gif":
            return {
                enabled: settings.store.gifEnabled,
                showBtn: false,
                showStar: settings.store.gifShowStar,
                alwaysSendInstantly: settings.store.gifAlwaysSendInstantly,
                alwaysUploadFile: settings.store.gifAlwaysUploadFile,
            };
        case "image":
            return {
                enabled: settings.store.imageEnabled,
                showBtn: settings.store.imageShowBtn,
                showStar: settings.store.imageShowStar,
                alwaysSendInstantly: settings.store.imageAlwaysSendInstantly,
                alwaysUploadFile: settings.store.imageAlwaysUploadFile,
            };
        case "video":
            return {
                enabled: settings.store.videoEnabled,
                showBtn: settings.store.videoShowBtn,
                showStar: settings.store.videoShowStar,
                alwaysSendInstantly: settings.store.videoAlwaysSendInstantly,
                alwaysUploadFile: settings.store.videoAlwaysUploadFile,
            };
        case "audio":
            return {
                enabled: settings.store.audioEnabled,
                showBtn: settings.store.audioShowBtn,
                showStar: settings.store.audioShowStar,
                alwaysSendInstantly: settings.store.audioAlwaysSendInstantly,
                alwaysUploadFile: settings.store.audioAlwaysUploadFile,
            };
        case "file":
            return {
                enabled: settings.store.fileEnabled,
                showBtn: settings.store.fileShowBtn,
                showStar: settings.store.fileShowStar,
                alwaysSendInstantly: settings.store.fileAlwaysSendInstantly,
                alwaysUploadFile: settings.store.fileAlwaysUploadFile,
            };
    }
}
