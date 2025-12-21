/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { proxyLazyWebpack } from "@webpack";
import { Flux, FluxDispatcher } from "@webpack/common";

export const NsfwGuildIconsStore = proxyLazyWebpack(() => {
    const { Store } = Flux;

    const DB_KEY = "NsfwGuildIcons_guilds";

    class NsfwGuildIconsStore extends Store {
        private _guildIds = new Set<string>();

        public get guildIds() {
            return this._guildIds;
        }

        public async load() {
            const data = await DataStore.get(DB_KEY);
            if (data instanceof Set) this._guildIds = data;
        }

        public unload() {
            this._guildIds.clear();
        }

        private save() {
            DataStore.set(DB_KEY, this._guildIds);
        }

        public has(guildId: string) {
            return this._guildIds.has(guildId);
        }

        public add(guildId: string) {
            this._guildIds.add(guildId);
            this.save();
            this.emitChange();
        }

        public remove(guildId: string) {
            this._guildIds.delete(guildId);
            this.save();
            this.emitChange();
        }

        public toggle(guildId: string) {
            if (this.has(guildId)) {
                this.remove(guildId);
            } else {
                this.add(guildId);
            }
        }
    }

    return new NsfwGuildIconsStore(FluxDispatcher);
});

