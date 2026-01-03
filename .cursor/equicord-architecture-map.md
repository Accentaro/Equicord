# Equicord Architecture Map

**Directory-by-directory reference for understanding Equicord's structure.**

---

## @src/api/

**Purpose**: Public APIs for plugin authors to extend Discord's functionality.

**What it solves**:
- UI injection points (buttons, context menus, message accessories)
- Event listening (message events, Flux events)
- Data persistence (DataStore, Settings)
- Command registration
- Style management
- Notification display

**Safe for plugin authors**: ✅ **YES** — This is the primary API surface.

**Internal-only**: ❌ No — All exports are public APIs.

**Typical patterns**:
```typescript
import { Commands, ContextMenu, DataStore, Settings } from "@api";
import { definePluginSettings } from "@api/Settings";
```

**Common mistakes**:
- ❌ Not using APIs and creating custom implementations
- ❌ Accessing internal `_*` functions
- ❌ Forgetting to clean up in `stop()`

**Key exports**:
- `Commands` — Register slash commands
- `ContextMenu` — Patch context menus
- `MessageEvents` — Listen to message clicks/sends/edits
- `DataStore` — IndexedDB storage
- `Settings` — Plugin settings
- `Badges` — User profile badges
- `ChatButtons`, `HeaderBar`, `UserArea` — UI button injection
- `MessageAccessories`, `MessagePopover` — Message UI extensions
- `ServerList` — Server list elements
- `Styles` — Managed CSS
- `Notifications` — Show notifications
- `AudioPlayer` — Play Discord sounds or external audio

---

## @src/components/

**Purpose**: Reusable UI components that match Discord's design system.

**What it solves**:
- Consistent button styling
- Error boundaries
- Text components with proper sizing
- Form controls (switches, inputs)
- Layout components (Flex, Grid)
- Cards and containers

**Safe for plugin authors**: ✅ **YES** — All components are public.

**Internal-only**: ❌ No — All exports are public.

**Typical patterns**:
```typescript
import { Button, Card, ErrorBoundary, FormSwitch } from "@components";
```

**Common mistakes**:
- ❌ Creating custom button components
- ❌ Not using ErrorBoundary for injected components
- ❌ Creating custom text styling
- ❌ Recreating form controls

**Key exports**:
- `Button`, `LinkButton`, `TextButton` — Button variants
- `Card` — Container with variants
- `ErrorBoundary` — Error handling wrapper
- `BaseText`, `Heading`, `Paragraph`, `Span` — Text components
- `FormSwitch`, `Switch` — Form controls
- `Flex`, `Grid`, `Divider` — Layout components
- `Link`, `CodeBlock`, `Notice`, `ErrorCard` — Utility components

---

## @src/utils/

**Purpose**: Utility functions for common operations.

**What it solves**:
- Discord-specific operations (getCurrentChannel, sendMessage, etc.)
- React hooks (useAwaiter, useForceUpdater, etc.)
- Text manipulation
- Modal system
- Clipboard operations
- Logging
- Lazy loading
- CSS utilities

**Safe for plugin authors**: ✅ **YES** — All utilities are public.

**Internal-only**: ❌ No — All exports are public.

**Typical patterns**:
```typescript
import { getCurrentChannel, sendMessage, copyWithToast } from "@utils/discord";
import { useAwaiter, useForceUpdater } from "@utils/react";
import { openModal, ModalRoot } from "@utils/modal";
import { Logger } from "@utils/Logger";
```

**Common mistakes**:
- ❌ Creating custom logging utilities
- ❌ Not using Discord utilities for Discord operations
- ❌ Creating custom modal systems
- ❌ Not using lazy loading for heavy components

**Key exports**:
- `discord.tsx` — Discord operations (getCurrentChannel, sendMessage, openUserProfile, etc.)
- `react.tsx` — React hooks (useAwaiter, useForceUpdater, useIntersection, etc.)
- `modal.tsx` — Modal system (openModal, ModalRoot, ModalHeader, etc.)
- `text.ts` — Text utilities (formatDuration, humanFriendlyJoin, etc.)
- `Logger` — Structured logging
- `clipboard` — Clipboard operations
- `lazy`, `lazyReact` — Lazy loading utilities
- `css` — CSS utilities (classNameFactory, etc.)

---

## @src/webpack/

**Purpose**: Webpack module discovery and Discord internals access.

**What it solves**:
- Finding Discord modules by properties or code
- Accessing Discord stores, components, and utilities
- Lazy loading webpack modules
- Type-safe access to Discord internals

**Safe for plugin authors**: ✅ **YES** — Use `@webpack/common` exports when available.

**Internal-only**: ⚠️ **PARTIAL** — Prefer `@webpack/common` over direct webpack access.

**Typical patterns**:
```typescript
// Prefer common exports
import { UserStore, ChannelStore, FluxDispatcher, RestAPI, Toasts } from "@webpack/common";

// Use finders only when common exports don't exist
import { findByPropsLazy, findByCodeLazy } from "@webpack";
```

**Common mistakes**:
- ❌ Using webpack finders when `@webpack/common` exports exist
- ❌ Directly accessing `window.webpackChunkdiscord_app`
- ❌ Not using lazy finders in hot paths
- ❌ Forgetting to unsubscribe from Flux events

**Key exports**:
- `@webpack/common/stores` — All Discord stores (UserStore, ChannelStore, etc.)
- `@webpack/common/components` — Discord components (Button, TextInput, Select, etc.)
- `@webpack/common/utils` — Discord utilities (FluxDispatcher, RestAPI, Toasts, etc.)
- `@webpack/index` — Finders (findByProps, findByCode, findStore, etc.)

---

## @src/plugins/_api/

**Purpose**: Internal API implementations that power `@src/api/`.

**What it solves**:
- Low-level patching for API functionality
- Internal API implementations
- Core API infrastructure

**Safe for plugin authors**: ❌ **NO** — This is internal implementation.

**Internal-only**: ✅ **YES** — Do not import from here.

**Typical patterns**: N/A — Plugin authors should not use this.

**Common mistakes**:
- ❌ Importing from `@src/plugins/_api/` instead of `@api/`
- ❌ Accessing internal implementation details

---

## @src/equicordplugins/_api/

**Purpose**: Equicord-specific API implementations.

**What it solves**:
- Equicord-specific APIs (HeaderBar, UserArea, AudioPlayer)
- Internal API implementations for Equicord features

**Safe for plugin authors**: ❌ **NO** — This is internal implementation.

**Internal-only**: ✅ **YES** — Do not import from here.

**Typical patterns**: N/A — Plugin authors should not use this.

**Common mistakes**:
- ❌ Importing from `@src/equicordplugins/_api/` instead of `@api/`

---

## @src/plugins/

**Purpose**: Vencord core plugins (stock plugins).

**What it solves**:
- Core functionality plugins
- Example implementations
- Reference patterns

**Safe for plugin authors**: ⚠️ **REFERENCE ONLY** — Study patterns, don't import.

**Internal-only**: ⚠️ **PARTIAL** — These are plugins, but they're core to Vencord.

**Typical patterns**: Study these for reference on how to structure plugins.

**Common mistakes**:
- ❌ Importing from other plugins (creates dependencies)
- ❌ Copying code without understanding patterns

---

## @src/equicordplugins/

**Purpose**: Equicord-specific plugins.

**What it solves**:
- Equicord feature plugins
- Example implementations
- Reference patterns

**Safe for plugin authors**: ⚠️ **REFERENCE ONLY** — Study patterns, don't import.

**Internal-only**: ⚠️ **PARTIAL** — These are plugins, but they're examples.

**Typical patterns**: Study these for reference on how to structure Equicord plugins.

**Common mistakes**:
- ❌ Importing from other plugins (creates dependencies)
- ❌ Copying code without understanding patterns

---

## @src/debug/

**Purpose**: Debugging and diagnostic tools.

**What it solves**:
- Performance tracing
- Reporter functionality
- Lazy chunk loading diagnostics

**Safe for plugin authors**: ⚠️ **CONDITIONAL** — Use only for debugging.

**Internal-only**: ⚠️ **PARTIAL** — Some tools are for development only.

**Typical patterns**:
```typescript
// Only in development
if (IS_DEV) {
    import { traceFunction } from "@debug/Tracer";
}
```

**Common mistakes**:
- ❌ Using debug tools in production code
- ❌ Not guarding debug code with `IS_DEV`

---

## @src/main/

**Purpose**: Main process code (Electron main process).

**What it solves**:
- Main process initialization
- IPC handling
- Native module access
- CSP management
- Updater functionality

**Safe for plugin authors**: ❌ **NO** — This is main process code.

**Internal-only**: ✅ **YES** — Renderer process code should not use this.

**Typical patterns**: N/A — Plugin authors should not use this.

**Common mistakes**:
- ❌ Trying to use main process code in renderer
- ❌ Accessing native modules directly

---

## @src/shared/

**Purpose**: Code shared between main and renderer processes.

**What it solves**:
- IPC event types
- Shared utilities (debounce, onceDefined)
- Settings store implementation

**Safe for plugin authors**: ⚠️ **CONDITIONAL** — Use re-exports from `@utils` instead.

**Internal-only**: ⚠️ **PARTIAL** — Prefer `@utils` re-exports.

**Typical patterns**:
```typescript
// Prefer re-exports
import { debounce } from "@utils"; // Re-exported from @shared/debounce
```

**Common mistakes**:
- ❌ Importing directly from `@shared/` instead of `@utils/`

---

## @packages/discord-types/

**Purpose**: TypeScript type definitions for Discord objects.

**What it solves**:
- Type safety for Discord objects
- Store type definitions
- Component type definitions
- Flux event types

**Safe for plugin authors**: ✅ **YES** — Use for type definitions.

**Internal-only**: ❌ No — Types are public.

**Typical patterns**:
```typescript
import type { Channel, Message, User, Guild } from "@vencord/discord-types";
```

**Common mistakes**:
- ❌ Not using types for Discord objects
- ❌ Using `any` instead of proper types

---

## Directory Interaction Patterns

### Plugin → API
```typescript
// Plugins use APIs
import { Commands, ContextMenu, DataStore } from "@api";
```

### Plugin → Components
```typescript
// Plugins use components
import { Button, Card, ErrorBoundary } from "@components";
```

### Plugin → Utils
```typescript
// Plugins use utilities
import { getCurrentChannel, sendMessage } from "@utils/discord";
```

### Plugin → Webpack
```typescript
// Plugins use webpack common exports
import { UserStore, FluxDispatcher, RestAPI } from "@webpack/common";
```

### API → Webpack
```typescript
// APIs use webpack to find Discord internals
import { findByPropsLazy } from "@webpack";
```

### API → Utils
```typescript
// APIs use utilities
import { Logger } from "@utils/Logger";
```

---

## Decision Tree: Where to Look

1. **Need to extend Discord UI?** → `@api/` (ContextMenu, HeaderBar, MessageAccessories, etc.)
2. **Need UI components?** → `@components/` or `@webpack/common/components`
3. **Need Discord operations?** → `@utils/discord` or `@webpack/common/utils`
4. **Need to store data?** → `@api/DataStore` or `@api/Settings`
5. **Need React hooks?** → `@utils/react`
6. **Need modals?** → `@utils/modal`
7. **Need Discord stores?** → `@webpack/common/stores`
8. **Need to find Discord modules?** → `@webpack` finders (only if not in common)
9. **Need types?** → `@vencord/discord-types`

**Always check `@api`, `@components`, `@utils`, and `@webpack/common` FIRST.**

