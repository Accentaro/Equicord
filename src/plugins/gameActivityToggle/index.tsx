/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./style.css";

import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { getUserSettingLazy } from "@api/UserSettings";
import equicordToolbox from "@equicordplugins/equicordToolbox";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Menu } from "@webpack/common";

const ShowCurrentGame = getUserSettingLazy<boolean>("status", "showCurrentGame")!;

const settings = definePluginSettings({
    oldIcon: {
        type: OptionType.BOOLEAN,
        description: "Use the old icon style before Discord icon redesign",
        default: false
    },
    location: {
        type: OptionType.SELECT,
        description: "Where to show the game activity toggle button",
        options: [
            { label: "Next to Mute/Deafen", value: "PANEL", default: true },
            { label: "Equicord Toolbox", value: "TOOLBOX" }
        ],
        get hidden() {
            return !isPluginEnabled(equicordToolbox.name);
        }
    }
});

function Icon({ className }: { className?: string; }) {
    const showCurrentGame = ShowCurrentGame.useSetting();

    return (
        <svg className={className} width="20" height="20" viewBox="0 0 24 24">
            <path
                fill={showCurrentGame ? "var(--status-positive)" : "var(--status-danger)"}
                d="M3.06 20.4q-1.53 0-2.37-1.065T.06 16.74l1.26-9q.27-1.8 1.605-2.97T6.06 3.6h11.88q1.8 0 3.135 1.17t1.605 2.97l1.26 9q.21 1.53-.63 2.595T20.94 20.4q-.63 0-1.17-.225T18.78 19.5l-2.7-2.7H7.92l-2.7 2.7q-.45.45-.99.675t-1.17.225Zm14.94-7.2q.51 0 .855-.345T19.2 12q0-.51-.345-.855T18 10.8q-.51 0-.855.345T16.8 12q0 .51.345 .855T18 13.2Zm-2.4-3.6q.51 0 .855-.345T16.8 8.4q0-.51-.345-.855T15.6 7.2q-.51 0-.855.345T14.4 8.4q0 .51.345 .855T15.6 9.6ZM6.9 13.2h1.8v-2.1h2.1v-1.8h-2.1v-2.1h-1.8v2.1h-2.1v1.8h2.1v2.1Z"
            />
        </svg>
    );
}

function GameActivityToggleButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    const { location } = settings.use(["location"]);
    const showCurrentGame = ShowCurrentGame.useSetting();

    if (location !== "PANEL" && isPluginEnabled(equicordToolbox.name)) return null;

    return (
        <UserAreaButton
            tooltipText={hideTooltips ? void 0 : showCurrentGame ? "Disable Game Activity" : "Enable Game Activity"}
            icon={<Icon className={iconForeground} />}
            role="switch"
            aria-checked={!showCurrentGame}
            redGlow={!showCurrentGame}
            plated={false}
            onClick={() => ShowCurrentGame.updateSetting(old => !old)}
        />
    );
}

export default definePlugin({
    name: "GameActivityToggle",
    description: "Adds a button next to the mic and deafen button to toggle game activity.",
    authors: [Devs.Nuckyz, Devs.RuukuLada],
    dependencies: ["UserSettingsAPI"],
    settings,

    userAreaButton: {
        icon: Icon,
        render: GameActivityToggleButton
    },

    toolboxActions() {
        const { location } = settings.use(["location"]);
        const showCurrentGame = ShowCurrentGame.useSetting();

        if (location !== "TOOLBOX") return null;

        return (
            <Menu.MenuCheckboxItem
                id="game-activity-toggle-toolbox"
                label="Enable Game Activity"
                checked={showCurrentGame}
                action={() => ShowCurrentGame.updateSetting(old => !old)}
            />
        );
    },
});
