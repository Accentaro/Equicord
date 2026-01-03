# Equicord API Reference

**Complete reference of reusable APIs, utilities, stores, and helpers.**

**Goal**: Prevent new helper functions from ever being written unnecessarily.

---

## Plugin Registration APIs

### Commands API (`@api/Commands`)

**Purpose**: Register slash commands that appear in Discord's command palette.

**When to use**:
- Creating custom slash commands
- Extending Discord's command system

**When NOT to use**:
- Don't create custom command systems
- Don't patch Discord's command registry directly

**Usage**:
```typescript
import { Commands } from "@api";
import { ApplicationCommandOptionType, ApplicationCommandType } from "@api/Commands";

Commands.registerCommand({
    name: "mycommand",
    description: "My command",
    type: ApplicationCommandType.CHAT_INPUT,
    options: [{
        name: "text",
        description: "Some text",
        type: ApplicationCommandOptionType.STRING,
        required: true
    }],
    execute: (args, ctx) => {
        const text = Commands.findOption<string>(args, "text");
        return Commands.sendBotMessage(ctx.channel.id, {
            content: `You said: ${text}`
        });
    }
}, "MyPlugin");
```

**Key functions**:
- `registerCommand(command, pluginName)` — Register a command
- `unregisterCommand(name)` — Unregister a command
- `prepareOption(opt)` — Prepare command option
- `findOption<T>(args, name, fallbackValue?)` — Get option value
- `sendBotMessage(channelId, message)` — Send message as Clyde
- `generateId()` — Generate message ID

---

### ContextMenu API (`@api/ContextMenu`)

**Purpose**: Add items to Discord's context menus (right-click menus).

**When to use**:
- Adding items to user context menus
- Adding items to message context menus
- Adding items to channel context menus

**When NOT to use**:
- Don't create custom context menu systems
- Don't directly modify context menu React elements

**Usage**:
```typescript
import { ContextMenu } from "@api";
import { Menu } from "@webpack/common";

const patch: NavContextMenuPatchCallback = (children, props) => {
    const group = ContextMenu.findGroupChildrenByChildId("block", children);
    if (!group) return;

    group.push(
        <Menu.MenuItem
            id="my-action"
            label="My Action"
            action={() => console.log("Clicked!", props.user)}
        />
    );
};

// In plugin definition
contextMenus: {
    "user-context": patch
}
```

**Key functions**:
- `addContextMenuPatch(navId, patch)` — Add patch to specific menu
- `addGlobalContextMenuPatch(patch)` — Patch all context menus
- `removeContextMenuPatch(navId, patch)` — Remove patch
- `findGroupChildrenByChildId(id, children, matchSubstring?)` — Find menu group

**Common navIds**:
- `"user-context"` — User profile context menu
- `"message-context"` — Message context menu
- `"channel-context"` — Channel context menu
- `"thread-context"` — Thread context menu

---

### Badges API (`@api/Badges`)

**Purpose**: Add badges to user profiles.

**When to use**:
- Adding custom badges to user profiles
- Showing contributor/donor badges

**When NOT to use**:
- Don't manually patch profile components

**Usage**:
```typescript
import { Badges } from "@api";
import { BadgePosition } from "@api/Badges";

Badges.addProfileBadge({
    description: "My Badge",
    iconSrc: "https://example.com/badge.png",
    position: BadgePosition.START,
    shouldShow: (userInfo) => userInfo.userId === "123456789"
});
```

**Key functions**:
- `addProfileBadge(badge)` — Add badge
- `removeProfileBadge(badge)` — Remove badge

---

## UI Extension APIs

### ChatButtons API (`@api/ChatButtons`)

**Purpose**: Add buttons to the chat input area.

**When to use**:
- Adding buttons next to emoji/GIF/sticker buttons
- Creating quick action buttons

**When NOT to use**:
- Don't manually inject buttons into chat input

**Usage**:
```typescript
import { ChatButtons } from "@api";
import { ChatBarButton } from "@api/ChatButtons";
import { MyIcon } from "./MyIcon";

ChatButtons.addChatBarButton("my-button", (props) => (
    <ChatBarButton
        tooltip="My Button"
        onClick={() => console.log("Clicked!")}
    >
        <MyIcon />
    </ChatBarButton>
), MyIcon);
```

**Key functions**:
- `addChatBarButton(id, render, icon)` — Add button
- `removeChatBarButton(id)` — Remove button

---

### HeaderBar API (`@api/HeaderBar`)

**Purpose**: Add buttons to the header bar (title bar) or channel toolbar.

**When to use**:
- Adding buttons to the top header bar
- Adding buttons to the channel toolbar (below search bar)

**When NOT to use**:
- Don't manually patch header bar components

**Usage**:
```typescript
import { HeaderBar } from "@api";
import { HeaderBarButton } from "@api/HeaderBar";
import { MyIcon } from "./MyIcon";

HeaderBar.addHeaderBarButton("my-header-button", () => (
    <HeaderBarButton
        icon={MyIcon}
        tooltip="My Button"
        onClick={() => console.log("Clicked!")}
    />
), 0);

// Or for channel toolbar
HeaderBar.addChannelToolbarButton("my-toolbar", () => (
    <ChannelToolbarButton
        icon={MyIcon}
        tooltip="My Button"
        onClick={() => console.log("Clicked!")}
        selected={isOpen}
    />
), 0);
```

**Key functions**:
- `addHeaderBarButton(id, render, priority?)` — Add to header bar
- `removeHeaderBarButton(id)` — Remove from header bar
- `addChannelToolbarButton(id, render, priority?)` — Add to channel toolbar
- `removeChannelToolbarButton(id)` — Remove from toolbar

---

### UserArea API (`@api/UserArea`)

**Purpose**: Add buttons to the user area panel (bottom left).

**When to use**:
- Adding buttons to the user area panel

**When NOT to use**:
- Don't manually patch user area components

**Usage**:
```typescript
import { UserArea } from "@api";
import { UserAreaButton } from "@api/UserArea";
import { MyIcon } from "./MyIcon";

UserArea.addUserAreaButton("my-user-button", (props) => (
    <UserAreaButton
        icon={<MyIcon />}
        tooltipText="My Button"
        onClick={() => console.log("Clicked!")}
    />
), 0);
```

**Key functions**:
- `addUserAreaButton(id, render, priority?)` — Add button
- `removeUserAreaButton(id)` — Remove button

---

### MessagePopover API (`@api/MessagePopover`)

**Purpose**: Add buttons to the message popover (hover menu).

**When to use**:
- Adding actions to message hover menu

**When NOT to use**:
- Don't manually patch message popover components

**Usage**:
```typescript
import { MessagePopover } from "@api";
import { MyIcon } from "./MyIcon";

MessagePopover.addMessagePopoverButton("my-popover-button", (message) => ({
    label: "My Action",
    icon: MyIcon,
    message,
    channel: message.channel,
    onClick: () => console.log("Clicked!", message)
}), MyIcon);
```

**Key functions**:
- `addMessagePopoverButton(id, render, icon)` — Add button
- `removeMessagePopoverButton(id)` — Remove button

---

### MessageAccessories API (`@api/MessageAccessories`)

**Purpose**: Add components below messages.

**When to use**:
- Adding UI elements below messages
- Displaying message metadata

**When NOT to use**:
- Don't manually patch message rendering

**Usage**:
```typescript
import { MessageAccessories } from "@api";

MessageAccessories.addMessageAccessory("my-accessory", (props) => {
    return <div>My Accessory</div>;
}, 0); // Position 0 = beginning, negative = from end
```

**Key functions**:
- `addMessageAccessory(id, render, position?)` — Add accessory
- `removeMessageAccessory(id)` — Remove accessory

---

### MessageDecorations API (`@api/MessageDecorations`)

**Purpose**: Add decorations to message authors.

**When to use**:
- Adding icons/badges next to message authors

**When NOT to use**:
- Don't manually patch message author rendering

**Usage**:
```typescript
import { MessageDecorations } from "@api";

MessageDecorations.addMessageDecoration("my-decoration", (props) => {
    if (props.message.author.id === "123456789") {
        return <span className="my-decoration">⭐</span>;
    }
    return null;
});
```

**Key functions**:
- `addMessageDecoration(id, decoration)` — Add decoration
- `removeMessageDecoration(id)` — Remove decoration

---

### ServerList API (`@api/ServerList`)

**Purpose**: Add elements to the server list.

**When to use**:
- Adding custom server list items

**When NOT to use**:
- Don't manually patch server list components

**Usage**:
```typescript
import { ServerList } from "@api";
import { ServerListRenderPosition } from "@api/ServerList";

const MyServerElement = () => <div>My Server</div>;

ServerList.addServerListElement(ServerListRenderPosition.Below, MyServerElement);
```

**Key functions**:
- `addServerListElement(position, renderFunction)` — Add element
- `removeServerListElement(position, renderFunction)` — Remove element

---

## Event & Message APIs

### MessageEvents API (`@api/MessageEvents`)

**Purpose**: Listen to message clicks, sends, and edits.

**When to use**:
- Intercepting message sends/edits
- Listening to message clicks
- Modifying messages before they're sent

**When NOT to use**:
- Don't directly patch message send/edit handlers

**Usage**:
```typescript
import { MessageEvents } from "@api";

// Intercept message sending
const listener = MessageEvents.addMessagePreSendListener((channelId, messageObj, options) => {
    // Modify messageObj.content, etc.
    // Return { cancel: true } to cancel sending
});

// Listen to message clicks
MessageEvents.addMessageClickListener((message, channel, event) => {
    console.log("Message clicked:", message.id);
});
```

**Key functions**:
- `addMessagePreSendListener(listener)` — Before message is sent
- `removeMessagePreSendListener(listener)` — Remove listener
- `addMessagePreEditListener(listener)` — Before message is edited
- `removeMessagePreEditListener(listener)` — Remove listener
- `addMessageClickListener(listener)` — On message click
- `removeMessageClickListener(listener)` — Remove listener

---

### MessageUpdater API (`@api/MessageUpdater`)

**Purpose**: Update and re-render messages.

**When to use**:
- Updating message content programmatically
- Triggering message re-render

**When NOT to use**:
- Don't manually update message cache

**Usage**:
```typescript
import { MessageUpdater } from "@api";

// Update message content
MessageUpdater.updateMessage(channelId, messageId, {
    content: "Updated content"
});

// Just re-render without changes
MessageUpdater.updateMessage(channelId, messageId);
```

**Key functions**:
- `updateMessage(channelId, messageId, fields?)` — Update message

---

## Storage & Settings APIs

### DataStore API (`@api/DataStore`)

**Purpose**: IndexedDB storage for large/complex data.

**When to use**:
- Storing large data (arrays, objects, Blobs)
- Storing complex types (Maps, Sets)
- Storing data that exceeds localStorage limits

**When NOT to use**:
- Don't use for simple settings (use Settings API)
- Don't use localStorage for large data

**Usage**:
```typescript
import { DataStore } from "@api";

// Store data
await DataStore.set("myPlugin:data", { key: "value" });

// Get data
const data = await DataStore.get<{ key: string }>("myPlugin:data");

// Update atomically
await DataStore.update("myPlugin:counter", (old = 0) => old + 1);
```

**Key functions**:
- `get<T>(key, customStore?)` — Get value
- `set(key, value, customStore?)` — Set value
- `update<T>(key, updater, customStore?)` — Update value atomically
- `del(key, customStore?)` — Delete key
- `getMany<T>(keys, customStore?)` — Get multiple values
- `setMany(entries, customStore?)` — Set multiple values
- `delMany(keys, customStore?)` — Delete multiple keys
- `clear(customStore?)` — Clear all
- `keys<KeyType>(customStore?)` — Get all keys
- `values<T>(customStore?)` — Get all values
- `entries<KeyType, ValueType>(customStore?)` — Get all entries

---

### Settings API (`@api/Settings`)

**Purpose**: Plugin settings with UI and persistence.

**When to use**:
- User-configurable plugin options
- Settings that need UI in the settings tab

**When NOT to use**:
- Don't use for large/complex data (use DataStore)
- Don't access settings directly without using the API

**Usage**:
```typescript
import { Settings, definePluginSettings } from "@api";
import { OptionType } from "@utils/types";

// Define settings
const pluginSettings = definePluginSettings({
    mySetting: {
        type: OptionType.STRING,
        description: "My setting",
        default: "default value"
    }
});

// In plugin definition
export default definePlugin({
    name: "MyPlugin",
    settings: pluginSettings,
    start() {
        // Access settings
        const value = pluginSettings.store.mySetting;

        // Update settings (auto-saves)
        pluginSettings.store.mySetting = "new value";
    }
});

// In React component
function MyComponent() {
    const settings = pluginSettings.use();
    return <div>{settings.mySetting}</div>;
}
```

**Key functions**:
- `Settings` — Proxied settings object (auto-saves)
- `PlainSettings` — Unproxied settings (read-only)
- `useSettings(paths?)` — React hook for settings
- `definePluginSettings(def, checks?)` — Define plugin settings

---

## Style & Theme APIs

### Styles API (`@api/Styles`)

**Purpose**: Dynamically load and manage CSS styles.

**When to use**:
- Loading plugin-specific CSS
- Managing CSS that should enable/disable with plugin

**When NOT to use**:
- Don't manually inject styles without using managed styles

**Usage**:
```typescript
import { Styles } from "@api";
import pluginStyle from "./plugin.css?managed";

// In plugin start()
Styles.enableStyle(pluginStyle);

// Set dynamic class names
Styles.setStyleClassNames(pluginStyle, {
    thin: "thin-31rlnD",
    scrollerBase: "scrollerBase-_bVAAt"
});
```

**Key functions**:
- `enableStyle(name)` — Enable managed style
- `disableStyle(name)` — Disable managed style
- `toggleStyle(name)` — Toggle style
- `isStyleEnabled(name)` — Check if enabled
- `setStyleClassNames(name, classNames, recompile?)` — Set CSS class name variables
- `compileStyle(style)` — Recompile style

---

## Notification & UI Feedback APIs

### Notices API (`@api/Notices`)

**Purpose**: Show notices (snackbars) at the top of the screen.

**When to use**:
- Showing update prompts
- Showing important notifications

**When NOT to use**:
- Don't create custom notice implementations

**Usage**:
```typescript
import { Notices } from "@api";

Notices.showNotice(
    "Update available!",
    "Update",
    () => {
        // Handle update
    }
);
```

**Key functions**:
- `showNotice(message, buttonText, onOkClick)` — Show notice

---

### Notifications API (`@api/Notifications`)

**Purpose**: Show desktop notifications.

**When to use**:
- Showing desktop notifications
- Notifying users of events

**When NOT to use**:
- Don't use browser Notification API directly

**Usage**:
```typescript
import { Notifications } from "@api";

Notifications.showNotification({
    title: "New Message",
    body: "You have a new message",
    icon: "https://example.com/icon.png",
    onClick: () => {
        // Handle click
    },
    permanent: false
});
```

**Key functions**:
- `showNotification(data)` — Show notification
- `requestPermission()` — Request notification permission

---

## Audio API

### AudioPlayer API (`@api/AudioPlayer`)

**Purpose**: Play Discord's internal audio files or external audio URLs.

**When to use**:
- Playing Discord sounds (notification sounds, etc.)
- Playing external audio files

**When NOT to use**:
- Don't use HTMLAudioElement directly for Discord audio

**Usage**:
```typescript
import { AudioPlayer } from "@api";
import { AudioType } from "@api/AudioPlayer";

// Play Discord sound
const player = AudioPlayer.playAudio("discodo", {
    volume: 50,
    speed: 1.0
});

// Play external URL
const player2 = AudioPlayer.createAudioPlayer("https://example.com/sound.mp3", {
    volume: 100,
    onEnded: () => console.log("Finished")
});

player2.play();
```

**Key functions**:
- `createAudioPlayer(audio, options?)` — Create audio player
- `playAudio(audio, options?)` — Play audio instantly
- `identifyAudioType(audio)` — Identify audio type
- `addAudioProcessor(key, processor)` — Add audio processor
- `removeAudioProcessor(key)` — Remove processor

---

## Discord Utilities (`@utils/discord`)

**Purpose**: Discord-specific operations.

**Key functions**:
- `getCurrentChannel()` — Get current channel
- `getCurrentGuild()` — Get current guild
- `sendMessage(channelId, data, waitForChannelReady?, options?)` — Send message
- `openUserProfile(id)` — Open user profile modal
- `fetchUserProfile(id, options?, cache?)` — Fetch user profile
- `openPrivateChannel(userId)` — Open DM channel
- `copyWithToast(text, toastMessage?)` — Copy to clipboard with toast
- `insertTextIntoChatInputBox(text)` — Insert text into chat input
- `openImageModal(item, mediaModalProps?)` — Open image modal
- `getUniqueUsername(user)` — Get unique username (handles pomelo)
- `getEmojiURL(id, animated, size)` — Get emoji URL
- `getGuildAcronym(guild)` — Get guild acronym
- `hasGuildFeature(guild, feature)` — Check guild feature

---

## Modal Utilities (`@utils/modal`)

**Purpose**: Modal system for displaying dialogs.

**Key functions**:
- `openModal(render, options?, contextKey?)` — Open modal
- `openModalLazy(render, options?)` — Open modal with lazy render
- `closeModal(modalKey, contextKey?)` — Close modal
- `closeAllModals()` — Close all modals
- `openMediaModal(props)` — Open media viewer modal

**Components**:
- `ModalRoot` — Root modal component
- `ModalHeader` — Modal header
- `ModalContent` — Modal content
- `ModalFooter` — Modal footer
- `ModalCloseButton` — Close button

**Usage**:
```typescript
import { openModal, ModalRoot, ModalHeader, ModalContent, ModalCloseButton, ModalSize } from "@utils/modal";

openModal((props) => (
    <ModalRoot {...props} size={ModalSize.MEDIUM}>
        <ModalHeader>
            <ModalCloseButton onClick={props.onClose} />
        </ModalHeader>
        <ModalContent>
            Content here
        </ModalContent>
    </ModalRoot>
));
```

---

## React Utilities (`@utils/react`)

**Purpose**: React hooks and utilities.

**Key hooks**:
- `useAwaiter<T>(factory, opts?)` — Await promises in React
- `useForceUpdater()` — Force component rerender
- `useIntersection(intersectOnly?)` — Check if element is on screen
- `useTimer({ interval, deps })` — Timer hook
- `useFixedTimer({ interval, initialTime })` — Fixed timer hook
- `useCleanupEffect(effect, deps?)` — Effect with cleanup

**Usage**:
```typescript
import { useAwaiter, useForceUpdater, useIntersection } from "@utils/react";

// Await promises
const [data, error, pending] = useAwaiter(() => fetchData(), {
    fallbackValue: null,
    onError: (e) => logger.error(e)
});

// Force rerender
const forceUpdate = useForceUpdater();

// Intersection observer
const [ref, isIntersecting] = useIntersection();
```

---

## Webpack Common (`@webpack/common`)

**Purpose**: Pre-found Discord stores, components, and utilities.

**Stores** (`@webpack/common/stores`):
- `UserStore`, `ChannelStore`, `GuildStore`, `MessageStore`
- `SelectedChannelStore`, `SelectedGuildStore`
- `GuildMemberStore`, `PermissionStore`, `PresenceStore`
- `ReadStateStore`, `TypingStore`, `VoiceStateStore`
- `EmojiStore`, `StickersStore`, `ThemeStore`, `WindowStore`
- And many more...

**Components** (`@webpack/common/components`):
- `Button`, `TextInput`, `TextArea`, `Select`, `SearchableSelect`
- `Slider`, `Popout`, `Dialog`, `TabBar`, `Paginator`
- `Clickable`, `Avatar`, `ColorPicker`, `UserSummaryItem`
- `ScrollerThin`, `ScrollerAuto`, `ListScrollerThin`, `ListScrollerAuto`
- `FocusLock`, `MaskedLink`, `Timestamp`, `Tooltip`

**Utils** (`@webpack/common/utils`):
- `FluxDispatcher` — Event dispatcher
- `RestAPI` — Discord REST API client
- `Constants` — Discord constants (Endpoints, UserFlags, etc.)
- `Toasts` — Toast notifications
- `MessageActions` — Message actions
- `UserUtils` — User utilities
- `IconUtils` — Icon utilities
- `NavigationRouter`, `ChannelRouter` — Navigation
- `PermissionsBits` — Permission bits
- And many more...

**Usage**:
```typescript
import { UserStore, ChannelStore, FluxDispatcher, RestAPI, Toasts } from "@webpack/common";
import { ScrollerThin, ListScrollerThin, Button, TextInput } from "@webpack/common";
```

---

## Summary

**Always check these APIs first**:
1. `@api/` — Plugin registration and UI extension APIs
2. `@utils/discord` — Discord operations
3. `@utils/modal` — Modal system
4. `@utils/react` — React hooks
5. `@webpack/common` — Discord stores, components, utilities

**Never create**:
- Custom command systems (use Commands API)
- Custom context menu systems (use ContextMenu API)
- Custom storage (use DataStore or Settings API)
- Custom modal systems (use modal utilities)
- Custom notification systems (use Notifications API)
- Custom button components (use @components/Button or @webpack/common/components)

