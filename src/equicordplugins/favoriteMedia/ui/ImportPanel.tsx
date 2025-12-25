/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, Forms, React, showToast, Toasts } from "@webpack/common";

import { ensureLoaded, getNewCategoryId, getTypeData, save } from "../storage";
import { MediaType } from "../types";
import { checkSameUrl } from "../utils";

type ImportConfig = Partial<Record<MediaType, { medias?: any[]; categories?: any[]; }>> & Record<string, any>;

export function ImportPanel({
    configs,
    onClose,
}: {
    configs: ImportConfig[];
    onClose: () => void;
}) {
    const [busy, setBusy] = React.useState(false);

    return (
        <div className="fm-modal">
            <Forms.FormTitle>Import FavoriteMedia Config</Forms.FormTitle>
            <Forms.FormText>
                Imports medias + categories (merges by category name, de-dupes by URL).
            </Forms.FormText>
            <div className="fm-modalFooter">
                <Button
                    color={Button.Colors.GREEN}
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await ensureLoaded();

                            // BD import UI only imports non-GIF types.
                            const types: MediaType[] = ["image", "video", "audio", "file"];

                            for (const conf of configs) {
                                for (const type of types) {
                                    const typeData = conf[type];
                                    if (!typeData) continue;

                                    const current = getTypeData(type);
                                    const toImportCats = Array.isArray(typeData.categories) ? typeData.categories : [];
                                    const toImportMedias = Array.isArray(typeData.medias) ? typeData.medias : [];

                                    const importCategoryIdRemap = new Map<number, number>();

                                    for (const category of toImportCats) {
                                        if (!category?.name) continue;
                                        const existing = current.categories.find(c => c.name === category.name);
                                        if (existing) {
                                            importCategoryIdRemap.set(category.id, existing.id);
                                            continue;
                                        }
                                        const newId = getNewCategoryId(type);
                                        importCategoryIdRemap.set(category.id, newId);
                                        current.categories.push({
                                            id: newId,
                                            name: category.name,
                                            color: category.color ?? "#202225",
                                            category_id: category.category_id,
                                            thumbnail: category.thumbnail,
                                        });
                                    }

                                    for (const media of toImportMedias) {
                                        if (!media?.url) continue;
                                        if (current.medias.some(m => checkSameUrl(m.url, media.url))) continue;

                                        const m = { ...media };
                                        if (typeof m.category_id === "number" && importCategoryIdRemap.has(m.category_id)) {
                                            m.category_id = importCategoryIdRemap.get(m.category_id);
                                        }
                                        if (typeof m.category_id === "string" && /^import_\\d+$/.test(m.category_id)) {
                                            const id = Number(m.category_id.replace("import_", ""));
                                            if (!Number.isNaN(id)) m.category_id = id;
                                        }

                                        current.medias.push(m);
                                    }
                                }
                            }

                            await save();
                            showToast("Import successful.", Toasts.Type.SUCCESS);
                            onClose();
                        } catch {
                            showToast("Import failed.", Toasts.Type.FAILURE);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Import
                </Button>
                <Button onClick={onClose} disabled={busy}>Close</Button>
            </div>
        </div>
    );
}

