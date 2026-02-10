/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";

const cl = classNameFactory("vc-chatbubble-");

interface TrashZoneProps {
    isActive: boolean;
}

export function TrashZone({ isActive }: TrashZoneProps) {
    if (!isActive) return null;

    return (
        <div className={cl("trash-zone")}>
            <div className={cl("trash-icon")}>
                <svg viewBox="0 0 24 24" width="32" height="32">
                    <path
                        fill="currentColor"
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                </svg>
            </div>
            <div className={cl("trash-text")}>
                Drag here to remove
            </div>
        </div>
    );
}
