/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalRoot, ModalSize } from "@utils/modal";
import { Button, React } from "@webpack/common";

import { FavoriteMediaCacheDB } from "../cache";
import { getPerTypeSettings, settings } from "../settings";
import { MediaType } from "../types";
import { AllPicker } from "./AllPicker";
import { MediaPicker } from "./Picker";

const ALL_TYPES: MediaType[] = ["gif", "image", "video", "audio", "file"];

export function UnifiedPickerPanel({
    cache,
    initialType,
    onSelectMedia,
    onRequestClose,
}: {
    cache: FavoriteMediaCacheDB;
    initialType: "all" | MediaType;
    onSelectMedia: (type: MediaType, media: any) => void;
    onRequestClose?: () => void;
}) {
    const [activeType, setActiveType] = React.useState<"all" | MediaType>(initialType);

    const enabledTypes = ALL_TYPES.filter(t => t === "gif" ? settings.store.gifEnabled : (getPerTypeSettings(t).enabled));

    React.useEffect(() => {
        if (activeType !== "all" && !enabledTypes.includes(activeType)) {
            setActiveType("all");
        }
    }, [activeType, enabledTypes]);

    return (
        <div>
            <div style={{ padding: "8px 10px", display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid var(--background-tertiary)" }}>
                <Button
                    key="fm-tab-all"
                    size={Button.Sizes.SMALL}
                    style={{ padding: "4px 8px", minHeight: 24, fontSize: 12 }}
                    color={activeType === "all" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                    onClick={() => setActiveType("all")}
                >
                    ALL
                </Button>
                {enabledTypes.map(t => (
                    <Button
                        key={`fm-tab-${t}`}
                        size={Button.Sizes.SMALL}
                        style={{ padding: "4px 8px", minHeight: 24, fontSize: 12 }}
                        color={activeType === t ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                        onClick={() => setActiveType(t)}
                    >
                        {t.toUpperCase()}
                    </Button>
                ))}
            </div>

            {activeType === "all"
                ? (
                    <AllPicker
                        cache={cache}
                        maxPerPage={settings.store.maxMediasPerPage as any}
                        allowCaching={settings.store.allowCaching}
                        onSelectMedia={(t, media) => onSelectMedia(t, media)}
                    />
                )
                : (
                    <MediaPicker
                        type={activeType}
                        cache={cache}
                        settings={{
                            hideUnsortedMedias: settings.store.hideUnsortedMedias,
                            hideThumbnail: settings.store.hideThumbnail,
                            maxMediasPerPage: settings.store.maxMediasPerPage as any,
                            mediaVolume: settings.store.mediaVolume,
                            allowCaching: settings.store.allowCaching,
                            alwaysSendInstantly: getPerTypeSettings(activeType).alwaysSendInstantly,
                            alwaysUploadFile: getPerTypeSettings(activeType).alwaysUploadFile,
                        }}
                        onRequestClose={onRequestClose}
                        onSelectMedia={media => onSelectMedia(activeType, media)}
                    />
                )}
        </div>
    );
}

export function UnifiedPickerModal({
    modalProps,
    cache,
    initialType,
    onSelectMedia,
}: {
    modalProps: any;
    cache: FavoriteMediaCacheDB;
    initialType: MediaType;
    onSelectMedia: (type: MediaType, media: any) => void;
}) {
    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE}>
            <UnifiedPickerPanel
                cache={cache}
                initialType="all"
                onRequestClose={modalProps.onClose}
                onSelectMedia={onSelectMedia}
            />
        </ModalRoot>
    );
}
