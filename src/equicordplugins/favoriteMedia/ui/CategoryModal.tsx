/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, Forms, React, TextInput } from "@webpack/common";

import { Category, MediaType } from "../types";

export function CategoryModal({
    type,
    initial,
    onSubmit,
    onCancel,
}: {
    type: MediaType;
    initial?: Partial<Category> | null;
    onSubmit: (values: { name: string; color: string; }) => void;
    onCancel: () => void;
}) {
    const [name, setName] = React.useState(initial?.name ?? "");
    const [color, setColor] = React.useState(initial?.color ?? "#202225");

    return (
        <form
            className="fm-modal"
            onSubmit={e => {
                e.preventDefault();
                if (!name.trim()) return;
                onSubmit({ name: name.trim(), color });
            }}
        >
            <Forms.FormTitle>{initial?.id ? "Edit Category" : "Create Category"}</Forms.FormTitle>
            <TextInput value={name} onChange={setName} placeholder="Category name" maxLength={20} />
            <div className="fm-colorRow">
                <Forms.FormText>Color</Forms.FormText>
                <input
                    type="color"
                    value={color}
                    onChange={e => setColor(e.currentTarget.value)}
                    className="fm-colorInput"
                />
            </div>
            <div className="fm-modalFooter">
                <Button type="button" onClick={onCancel}>Cancel</Button>
                <Button type="submit" color={Button.Colors.GREEN} disabled={!name.trim()}>Save</Button>
            </div>
        </form>
    );
}

