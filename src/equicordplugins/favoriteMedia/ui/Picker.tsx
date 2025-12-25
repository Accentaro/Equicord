/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { saveFile } from "@utils/web";
import { PluginNative } from "@utils/types";
import { Alerts, Button, ContextMenuApi, Forms, Menu, React, showToast, Toasts } from "@webpack/common";

import { FavoriteMediaCacheDB } from "../cache";
import * as storage from "../storage";
import { Category, MediaForType, MediaType } from "../types";
import { getUrlExt, getUrlName, isHttpUrl } from "../utils";
import { CategoryModal } from "./CategoryModal";
import { DatabasePanel } from "./DatabasePanel";
import { ImportPanel } from "./ImportPanel";
import { MediaFavButton } from "./components/MediaFavButton";
import { refreshUrls } from "../net";

type NativeApi = PluginNative<typeof import("../native")>;

function isProbablyVideoUrl(url: string) {
    const u = url.toLowerCase();
    const base = u.split("?")[0].split("#")[0];
    return (
        base.endsWith(".mp4")
        || base.endsWith(".webm")
        || base.endsWith(".mov")
        || base.endsWith(".m4v")
        || u.includes("format=mp4")
        || u.includes("format=webm")
    );
}

function getNative(): NativeApi | null {
    if (IS_WEB) return null;
    return Object.values(VencordNative.pluginHelpers)
        .find((m: any) => m.favoriteMediaUniqueIdThingyIdkMan) as NativeApi | null;
}

export function MediaPicker({
    type,
    cache,
    settings,
    onRequestClose,
    onSelectMedia,
}: {
    type: MediaType;
    cache: FavoriteMediaCacheDB;
    settings: {
        hideUnsortedMedias: boolean;
        hideThumbnail: boolean;
        maxMediasPerPage: number;
        mediaVolume: number;
        allowCaching: boolean;
        alwaysSendInstantly: boolean;
        alwaysUploadFile: boolean;
    };
    onRequestClose?: () => void;
    onSelectMedia: (media: MediaForType<any>) => void;
}) {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => storage.subscribe(() => forceUpdate()), []);

    const [page, setPage] = React.useState(1);
    const [categoryId, setCategoryId] = React.useState<number | null>(null);

    const typeData = storage.getTypeData(type as any) as any;
    const categories = typeData.categories as Category[];
    const medias = typeData.medias as MediaForType<any>[];

    const filteredCategories = React.useMemo(() => {
        return categories;
    }, [categories]);

    const currentCategories = React.useMemo(() => {
        return filteredCategories.filter(c => (categoryId == null ? c.category_id == null : c.category_id === categoryId));
    }, [filteredCategories, categoryId]);

    const filteredMedias = React.useMemo(() => {
        let list = medias;
        if (categoryId == null) {
            list = settings.hideUnsortedMedias ? list.filter(m => m.category_id == null) : list;
        } else {
            list = list.filter(m => m.category_id === categoryId);
        }
        return list;
    }, [medias, categoryId, settings.hideUnsortedMedias]);

    const pageSize = Math.max(1, settings.maxMediasPerPage);
    const totalPages = Math.max(1, Math.ceil((currentCategories.length + filteredMedias.length) / pageSize));

    const pageItems = React.useMemo(() => {
        const start = (page - 1) * pageSize;
        const items: Array<{ t: "category" | "media"; v: any; }> = [
            ...currentCategories.map(c => ({ t: "category" as const, v: c })),
            ...filteredMedias.map(m => ({ t: "media" as const, v: m })),
        ];
        return items.slice(start, start + pageSize);
    }, [currentCategories, filteredMedias, page, pageSize]);

    const openCreateCategory = () => {
        (Alerts as any).show({
            title: "Create Category",
            body: (modalProps: any) => (
                <CategoryModal
                    type={type}
                    onCancel={modalProps.onClose}
                    onSubmit={async v => {
                        await storage.createCategory(type, v, categoryId ?? undefined);
                        modalProps.onClose();
                    }}
                />
            ),
            confirmText: undefined,
            cancelText: undefined,
        });
    };

    const openEditCategory = (category: Category) => {
        (Alerts as any).show({
            title: "Edit Category",
            body: (modalProps: any) => (
                <CategoryModal
                    type={type}
                    initial={category}
                    onCancel={modalProps.onClose}
                    onSubmit={async v => {
                        await storage.editCategory(type, category.id, v);
                        modalProps.onClose();
                    }}
                />
            ),
            confirmText: undefined,
            cancelText: undefined,
        });
    };

    const openDatabase = () => {
        (Alerts as any).show({
            title: "Cache Database",
            body: (modalProps: any) => (
                <DatabasePanel cache={cache} onClose={modalProps.onClose} />
            ),
            confirmText: undefined,
            cancelText: undefined,
        });
    };

    const openImport = async () => {
        if (!IS_DISCORD_DESKTOP) {
            showToast("Import is desktop-only.", Toasts.Type.FAILURE);
            return;
        }

        const files = await DiscordNative.fileManager.openFiles({
            multiSelections: true,
            filters: [{ name: "Config", extensions: ["config.json"] }],
        });
        if (!files?.length) return;

        const configs: any[] = [];
        for (const file of files) {
            try {
                const text = new TextDecoder().decode(file.data);
                configs.push(JSON.parse(text));
            } catch {
                // ignore
            }
        }

        (Alerts as any).show({
            title: "Import",
            body: (modalProps: any) => (
                <ImportPanel configs={configs} onClose={modalProps.onClose} />
            ),
            confirmText: undefined,
            cancelText: undefined,
        });
    };

    return (
        <div className="fm-picker">
            <div className="fm-toolbar">
                <Forms.FormTitle className="fm-title">{type.toUpperCase()} Favorites</Forms.FormTitle>
                <div className="fm-toolbarActions">
                    <Button size={Button.Sizes.MIN} onClick={openCreateCategory}>New Category</Button>
                    <Button size={Button.Sizes.MIN} onClick={openImport}>Import</Button>
                    <Button size={Button.Sizes.MIN} onClick={openDatabase}>Cache DB</Button>
                    {onRequestClose && <Button size={Button.Sizes.MIN} onClick={onRequestClose}>Close</Button>}
                </div>
            </div>

            <div className="fm-filterRow">
                <div className="fm-page">
                    <Button
                        size={Button.Sizes.MIN}
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Prev
                    </Button>
                    <Forms.FormText className="fm-pageText">{page}/{totalPages}</Forms.FormText>
                    <Button
                        size={Button.Sizes.MIN}
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        Next
                    </Button>
                </div>
            </div>

            {categoryId != null && (
                <div className="fm-breadcrumb">
                    <Button
                        size={Button.Sizes.MIN}
                        onClick={() => {
                            const current = categories.find(c => c.id === categoryId);
                            setCategoryId(current?.category_id ?? null);
                            setPage(1);
                        }}
                    >
                        Back
                    </Button>
                    <Forms.FormText>
                        {categories.find(c => c.id === categoryId)?.name ?? "Category"}
                    </Forms.FormText>
                </div>
            )}

            <div className="fm-grid">
                {pageItems.length === 0 ? (
                    <div className="fm-empty">
                        <Forms.FormText>No favorites yet.</Forms.FormText>
                    </div>
                ) : (
                    pageItems.map(item => item.t === "category"
                        ? <CategoryCard
                            key={`cat-${item.v.id}`}
                            type={type}
                            category={item.v}
                            categories={categories}
                            cache={cache}
                            hideThumbnail={settings.hideThumbnail}
                            onOpen={() => { setCategoryId(item.v.id); setPage(1); }}
                            onEdit={() => openEditCategory(item.v)}
                        />
                        : <MediaCard
                            key={`media-${item.v.url}`}
                            type={type}
                            media={item.v}
                            settings={settings}
                            cache={cache}
                            categories={categories}
                            onSelectMedia={onSelectMedia}
                        />
                    )
                )}
            </div>
        </div>
    );
}

function CategoryCard({
    type,
    category,
    categories,
    cache,
    hideThumbnail,
    onOpen,
    onEdit,
}: {
    type: MediaType;
    category: Category;
    categories: Category[];
    cache: FavoriteMediaCacheDB;
    hideThumbnail: boolean;
    onOpen: () => void;
    onEdit: () => void;
}) {
    const color = category.color ?? "#202225";
    const thumb = !hideThumbnail ? category.thumbnail : undefined;
    const [thumbUrl, setThumbUrl] = React.useState<string | undefined>(() => thumb ? (thumb && isHttpUrl(thumb) ? thumb : undefined) : undefined);
    const descendantIds = React.useMemo(() => getDescendantCategoryIds(categories, category.id), [categories, category.id]);

    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (!thumb || !isHttpUrl(thumb)) {
                setThumbUrl(undefined);
                return;
            }

            const existing = cache.getObjectUrl(thumb);
            if (existing) {
                setThumbUrl(existing);
                return;
            }

            const bytes = await cache.get(thumb);
            if (!bytes) {
                setThumbUrl(thumb);
                return;
            }

            const obj = await cache.ensureObjectUrl(thumb, bytes);
            if (!cancelled) setThumbUrl(obj);
        })();
        return () => { cancelled = true; };
    }, [thumb, cache]);

    const onContextMenu = (e: React.MouseEvent) => {
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="fm-category-menu" onClose={() => { }}>
                <Menu.MenuGroup>
                    <Menu.MenuItem id="fm-cat-open" label="Open" action={onOpen} />
                    <Menu.MenuItem id="fm-cat-edit" label="Edit" action={onEdit} />
                    <Menu.MenuItem
                        id="fm-cat-download"
                        label="Download Category"
                        action={() => downloadCategory(type, category)}
                    />
                    <Menu.MenuItem
                        id="fm-cat-move"
                        label="Move Category"
                    >
                        <Menu.MenuItem
                            id="fm-cat-move-root"
                            label="(Root)"
                            action={() => storage.moveCategory(type, category.id, undefined)}
                        />
                        {categories
                            .filter(c => c.id !== category.id)
                            .filter(c => !descendantIds.has(c.id))
                            .map(c => (
                                <Menu.MenuItem
                                    key={`fm-cat-move-${c.id}`}
                                    id={`fm-cat-move-${c.id}`}
                                    label={c.name}
                                    action={() => storage.moveCategory(type, category.id, c.id)}
                                />
                            ))}
                    </Menu.MenuItem>
                    {category.thumbnail && (
                        <Menu.MenuItem
                            id="fm-cat-unset-thumb"
                            label="Unset Thumbnail"
                            action={() => storage.setCategoryThumbnail(type, category.id, undefined)}
                        />
                    )}
                    <Menu.MenuItem
                        id="fm-cat-delete"
                        label="Delete"
                        color="danger"
                        action={() => {
                            const hasChildren = storage.categoryHasSubcategories(type, category.id);
                            if (!hasChildren) {
                                void storage.deleteCategory(type, category.id, { deleteChildren: false });
                                return;
                            }
                            Alerts.show({
                                title: "Delete Category",
                                body: "This category has subcategories. Delete them too?",
                                confirmText: "Delete All",
                                confirmColor: Button.Colors.RED,
                                cancelText: "Cancel",
                                onConfirm: () => storage.deleteCategory(type, category.id, { deleteChildren: true }),
                            });
                        }}
                    />
                </Menu.MenuGroup>
            </Menu.Menu>
        ));
    };

    return (
        <div className="fm-card fm-category" onClick={onOpen} onContextMenu={onContextMenu}>
            <div className="fm-categoryThumb" style={{ backgroundColor: color }}>
                {thumbUrl && <img src={thumbUrl} className="fm-thumbImg" />}
            </div>
            <div className="fm-cardTitle">{category.name}</div>
        </div>
    );
}

function MediaCard({
    type,
    media,
    cache,
    categories,
    settings,
    onSelectMedia,
}: {
    type: MediaType;
    media: MediaForType<any>;
    cache: FavoriteMediaCacheDB;
    categories: Category[];
    settings: {
        mediaVolume: number;
        allowCaching: boolean;
        alwaysSendInstantly: boolean;
        alwaysUploadFile: boolean;
    };
    onSelectMedia: (media: MediaForType<any>) => void;
}) {
    const candidate = type === "gif" ? ((media as any).src ?? media.url) : ((media as any).poster ?? (media as any).src ?? media.url);
    const [previewUrl, setPreviewUrl] = React.useState<string>(() => (settings.allowCaching ? cache.getObjectUrl(candidate) : undefined) ?? candidate);
    const renderVideo = type === "video" || (type === "gif" && isProbablyVideoUrl(candidate));

    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (!settings.allowCaching) {
                setPreviewUrl(candidate);
                return;
            }
            const existing = cache.getObjectUrl(candidate);
            if (existing) {
                setPreviewUrl(existing);
                return;
            }
            const bytes = await cache.get(candidate);
            if (!bytes) {
                setPreviewUrl(candidate);
                return;
            }
            const obj = await cache.ensureObjectUrl(candidate, bytes);
            if (!cancelled) setPreviewUrl(obj);
        })();
        return () => { cancelled = true; };
    }, [candidate, cache, settings.allowCaching]);

    const onContextMenu = (e: React.MouseEvent) => {
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="fm-media-menu" onClose={() => { }}>
                <Menu.MenuGroup>
                    <Menu.MenuItem
                        id="fm-media-remove"
                        label="Remove from favorites"
                        color="danger"
                        action={() => storage.unfavorite(type, media.url)}
                    />
                    {media.category_id != null && (
                        <Menu.MenuItem
                            id="fm-media-remove-from-category"
                            label={`Remove from (${categories.find(c => c.id === media.category_id)?.name ?? "Category"})`}
                            color="danger"
                            action={() => storage.setMediaCategory(type, media.url, undefined)}
                        />
                    )}
                    {categories.length > 0 && (
                        <Menu.MenuItem
                            id="fm-media-move"
                            label={media.category_id != null ? "Move to" : "Add to"}
                        >
                            {categories
                                .filter(c => c.id !== media.category_id)
                                .map(c => (
                                    <Menu.MenuItem
                                        key={`fm-move-${c.id}`}
                                        id={`fm-move-${c.id}`}
                                        label={c.name}
                                        action={() => storage.setMediaCategory(type, media.url, c.id)}
                                    />
                                ))}
                        </Menu.MenuItem>
                    )}
                    {media.category_id != null && (type === "gif" || type === "image" || type === "video") && (
                        <Menu.MenuItem
                            id="fm-media-set-thumb"
                            label="Set as Category Thumbnail"
                            action={() => storage.setCategoryThumbnail(type, media.category_id!, media.url)}
                        />
                    )}
                    <Menu.MenuItem
                        id="fm-media-download"
                        label="Download"
                        action={() => downloadOne({ url: media.url, name: media.name }, type)}
                    />
                </Menu.MenuGroup>
            </Menu.Menu>
        ));
    };

    return (
        <div className="fm-card fm-media" onClick={() => onSelectMedia(media)} onContextMenu={onContextMenu}>
            <div className="fm-mediaPreview">
                {type === "audio" ? (
                    <audio controls preload="none" src={previewUrl} style={{ width: "100%" }} />
                ) : renderVideo ? (
                    <video
                        src={previewUrl}
                        poster={type === "video" ? (media as any).poster : undefined}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="fm-thumbVideo"
                    />
                ) : type === "gif" || type === "image" ? (
                    <img src={previewUrl} className="fm-thumbImg" />
                ) : (
                    <div className="fm-file">
                        <Forms.FormText>{media.name}</Forms.FormText>
                    </div>
                )}
                <div className="fm-mediaOverlay">
                    <MediaFavButton type={type} url={media.url} mode="picker" />
                </div>
            </div>
            <div className="fm-cardTitle">{media.name ?? getUrlName(media.url)}</div>
        </div>
    );
}

async function downloadOne(media: { url: string; name: string; }, type: MediaType) {
    const ext = type === "gif" ? ".gif" : getUrlExt(media.url, type);
    const filename = `${(media.name || getUrlName(media.url)).replaceAll(" ", "_")}${ext}`;

    try {
        const res = await fetch(media.url);
        const ab = await res.arrayBuffer();
        const bytes = new Uint8Array(ab);
        if (IS_DISCORD_DESKTOP) {
            await DiscordNative.fileManager.saveWithDialog(bytes, filename);
        } else {
            saveFile(new File([bytes], filename));
        }
        showToast("Downloaded.", Toasts.Type.SUCCESS);
    } catch {
        showToast("Failed to download.", Toasts.Type.FAILURE);
    }
}

async function downloadCategory(type: MediaType, category: Category) {
    if (!IS_DISCORD_DESKTOP) {
        showToast("Download Category is desktop-only.", Toasts.Type.FAILURE);
        return;
    }

    const Native = getNative();
    if (!Native) {
        showToast("Native helper not available.", Toasts.Type.FAILURE);
        return;
    }

    try {
        const baseDir = await Native.chooseDirectory();
        const folderName = (category.name ?? "category").replaceAll(/[<>:\"/\\\\|?*]/g, "_");
        const categoryFolder = `${baseDir}/${folderName}`;
        await Native.ensureDir(categoryFolder);

        const medias = storage.getTypeData(type).medias
            .filter(m => m.category_id === category.id)
            .map(m => ({ ...m }));

        const urls = medias.map(m => m.url);
        const refreshed = await refreshUrls(urls);
        for (const m of medias as any[]) {
            const r = refreshed.find(x => x.original === m.url && x.refreshed);
            if (r?.refreshed) m.url = r.refreshed;
        }

        for (const m of medias as any[]) {
            const ext = type === "gif" ? ".gif" : getUrlExt(m.url, type);
            const fileName = `${(m.name || getUrlName(m.url)).replaceAll(" ", "_")}${ext}`;
            const filePath = `${categoryFolder}/${fileName}`;
            if (await Native.fileExists(filePath)) continue;

            const res = await fetch(m.url);
            const ab = await res.arrayBuffer();
            await Native.writeFile(filePath, new Uint8Array(ab));
        }

        showToast("Downloaded category.", Toasts.Type.SUCCESS);
    } catch {
        showToast("Failed to download category.", Toasts.Type.FAILURE);
    }
}

function getDescendantCategoryIds(categories: Category[], rootId: number) {
    const ids = new Set<number>();
    const queue = [rootId];
    while (queue.length) {
        const cur = queue.pop()!;
        for (const c of categories) {
            if (c.category_id === cur && !ids.has(c.id)) {
                ids.add(c.id);
                queue.push(c.id);
            }
        }
    }
    return ids;
}
