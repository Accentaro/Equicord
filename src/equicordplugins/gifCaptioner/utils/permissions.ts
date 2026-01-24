/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Get max file size (Discord's limit is typically 25MB for non-nitro, 50MB for nitro)
export function getMaxFileSize(): number {
    // Default to 25MB in bytes
    return 25 * 1024 * 1024;
}
