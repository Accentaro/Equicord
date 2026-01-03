# Equicord Plugin Patterns

**Canonical patterns extracted from `@src/equicordplugins/` and `@src/plugins/`.**

**These patterns are proven, tested, and must be followed.**

---

## Pattern 1: Plugin Definition Structure

**Problem**: How to structure a plugin definition.

**Solution**:
```typescript
import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable feature",
        default: true
    }
});

export default definePlugin({
    name: "PluginName",
    description: "Clear description",
    authors: [EquicordDevs.YourName],
    dependencies: ["RequiredPlugin"], // Optional
    settings, // Optional
    patches: [ /* ... */ ],
    contextMenus: { /* ... */ },
    flux: { /* ... */ }, // Optional
    start() { /* ... */ },
    stop() { /* ... */ },
});
```

**Key points**:
- Always use `definePlugin()` from `@utils/types`
- Use `definePluginSettings()` for settings
- List all authors
- Declare dependencies
- Implement `start()` and `stop()` for lifecycle

---

## Pattern 2: Settings Definition

**Problem**: How to define and use plugin settings.

**Solution**:
```typescript
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable feature",
        default: true
    },
    chunkSize: {
        type: OptionType.NUMBER,
        description: "Chunk size (25-100)",
        default: 100,
        isValid: v => {
            const num = typeof v === "string" ? Number(v) : v;
            return Number.isFinite(num) && num >= 25 && num <= 100;
        }
    },
    sortMode: {
        type: OptionType.SELECT,
        description: "Sort mode",
        options: [
            { label: "Newest", value: "newest", default: true },
            { label: "Oldest", value: "oldest" }
        ]
    }
});

export default definePlugin({
    settings,
    start() {
        // Access settings
        const enabled = settings.store.enabled;
        const chunkSize = settings.store.chunkSize;
    }
});

// In React component
function MyComponent() {
    const { enabled, chunkSize } = settings.use(["enabled", "chunkSize"]);
    // Or use all
    const allSettings = settings.use();
}
```

**Key points**:
- Use `definePluginSettings()` for all settings
- Provide `isValid` for number/string validation
- Use `settings.store` for access in non-React code
- Use `settings.use()` in React components
- Settings auto-save when modified

---

## Pattern 3: Flux Event Subscriptions

**Problem**: How to subscribe to Discord Flux events.

**Solution A - Using `flux` object (preferred)**:
```typescript
export default definePlugin({
    flux: {
        CHANNEL_SELECT(data) {
            // Handle channel select
        },
        MESSAGE_CREATE(data) {
            // Handle message create
        }
    }
});
```

**Solution B - Manual subscription**:
```typescript
export default definePlugin({
    start() {
        const handler = (event: any) => {
            // Handle event
        };
        FluxDispatcher.subscribe("EVENT_NAME", handler);

        // Store handler for cleanup
        this.handler = handler;
    },

    stop() {
        if (this.handler) {
            FluxDispatcher.unsubscribe("EVENT_NAME", this.handler);
        }
    }
});
```

**Key points**:
- Prefer `flux` object for simple subscriptions (auto-managed)
- Use manual subscription for complex logic
- **Always unsubscribe** in `stop()`
- Store handler references for cleanup

---

## Pattern 4: Context Menu Patches

**Problem**: How to add items to Discord's context menus.

**Solution**:
```typescript
import { ContextMenu } from "@api";
import { Menu } from "@webpack/common";

const userContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props.user) return;

    const group = ContextMenu.findGroupChildrenByChildId("block", children);
    if (group) {
        group.push(
            <Menu.MenuItem
                id="my-action"
                label="My Action"
                action={() => {
                    console.log("Clicked!", props.user);
                }}
                icon={MyIcon}
            />
        );
    } else {
        children.push(
            <Menu.MenuItem
                id="my-action"
                label="My Action"
                action={() => console.log("Clicked!", props.user)}
            />
        );
    }
};

export default definePlugin({
    contextMenus: {
        "user-context": userContextPatch,
        "message-context": messageContextPatch,
        "channel-context": channelContextPatch
    }
});
```

**Key points**:
- Use `ContextMenu.findGroupChildrenByChildId()` to find existing groups
- Insert items into appropriate groups when possible
- Use unique `id` values (prefixed with plugin name)
- Check for required props before adding items

---

## Pattern 5: Patching Discord Code

**Problem**: How to modify Discord's code with patches.

**Solution**:
```typescript
export default definePlugin({
    patches: [
        {
            find: "unique string in Discord code",
            replacement: {
                match: /regex pattern/,
                replace: "replacement string"
            },
            predicate: () => settings.store.enabled, // Optional
            all: true // Optional, for multiple matches
        },
        {
            find: "another unique string",
            replacement: [
                {
                    match: /first pattern/,
                    replace: "first replacement"
                },
                {
                    match: /second pattern/,
                    replace: "second replacement"
                }
            ],
            group: true // All replacements must succeed
        }
    ]
});
```

**Key points**:
- Use `find` to locate unique, stable strings
- Keep regex patterns minimal and specific
- Use `predicate` to conditionally apply patches
- Use `group: true` when replacements depend on each other
- Use `all: true` for multiple matches in same module
- Escape special regex characters: `.*+?^${}()|[\]\`

---

## Pattern 6: UI Button Injection

**Problem**: How to add buttons to Discord's UI.

**Solution A - Header Bar Button**:
```typescript
import { HeaderBar } from "@api";
import { HeaderBarButton } from "@api/HeaderBar";
import { MyIcon } from "./MyIcon";

export default definePlugin({
    start() {
        HeaderBar.addHeaderBarButton("my-button", () => (
            <HeaderBarButton
                icon={MyIcon}
                tooltip="My Button"
                onClick={() => console.log("Clicked!")}
            />
        ), 0);
    },

    stop() {
        HeaderBar.removeHeaderBarButton("my-button");
    }
});
```

**Solution B - Chat Bar Button**:
```typescript
import { ChatButtons } from "@api";
import { ChatBarButton } from "@api/ChatButtons";
import { MyIcon } from "./MyIcon";

export default definePlugin({
    start() {
        ChatButtons.addChatBarButton("my-button", (props) => (
            <ChatBarButton
                tooltip="My Button"
                onClick={() => console.log("Clicked!")}
            >
                <MyIcon />
            </ChatBarButton>
        ), MyIcon);
    },

    stop() {
        ChatButtons.removeChatBarButton("my-button");
    }
});
```

**Key points**:
- Use appropriate API for each button location
- Always remove buttons in `stop()`
- Use unique IDs for buttons
- Provide icon for settings UI

---

## Pattern 7: Modal Management

**Problem**: How to open and manage modals.

**Solution**:
```typescript
import { openModal, closeModal, ModalRoot, ModalHeader, ModalContent, ModalCloseButton, ModalSize } from "@utils/modal";
import ErrorBoundary from "@components/ErrorBoundary";

let modalKey: string | null = null;

function openMyModal() {
    if (modalKey) return; // Already open

    modalKey = openModal((props) => (
        <ErrorBoundary noop>
            <ModalRoot {...props} size={ModalSize.MEDIUM}>
                <ModalHeader>
                    <ModalCloseButton onClick={props.onClose} />
                </ModalHeader>
                <ModalContent>
                    {/* Content */}
                </ModalContent>
            </ModalRoot>
        </ErrorBoundary>
    ), {
        onCloseCallback: () => {
            modalKey = null;
        }
    });
}

export default definePlugin({
    stop() {
        if (modalKey) {
            closeModal(modalKey);
            modalKey = null;
        }
    }
});
```

**Key points**:
- Track modal key for cleanup
- Use `onCloseCallback` to reset modal key
- Wrap modal content with `ErrorBoundary`
- Close modals in `stop()`

---

## Pattern 8: Virtualized Lists

**Problem**: How to render large lists efficiently.

**Solution**:
```typescript
import { ListScrollerThin } from "@webpack/common";
import { useMemo, useCallback } from "@webpack/common";

const BUFFER_ROWS = 2;
const ROW_HEIGHT = 150;

function MyList({ items }: { items: Item[] }) {
    // Group items into rows
    const { rows, totalRows } = useMemo(() => {
        const rowsArr: Item[][] = [];
        const columns = 4; // Items per row

        for (let i = 0; i < items.length; i += columns) {
            rowsArr.push(items.slice(i, i + columns));
        }

        return { rows: rowsArr, totalRows: rowsArr.length };
    }, [items]);

    // Calculate viewport rows
    const rowsPerViewport = useMemo(() => {
        // Estimate based on container height
        return Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT));
    }, [viewportHeight]);

    // Virtual chunk size
    const virtualChunkSize = useMemo(() =>
        Math.max(rowsPerViewport + BUFFER_ROWS, Math.max(1, rowsPerViewport)),
        [rowsPerViewport]
    );

    // Render row
    const renderRow = useCallback(({ rowIndex }: { rowIndex: number }) => {
        const rowItems = rows[rowIndex] || [];
        return (
            <div className="row">
                {rowItems.map(item => (
                    <ItemComponent key={item.id} item={item} />
                ))}
            </div>
        );
    }, [rows]);

    return (
        <ListScrollerThin
            sections={[totalRows]}
            sectionHeight={0}
            rowHeight={ROW_HEIGHT}
            renderSection={() => null}
            renderRow={renderRow}
            renderFooter={renderFooter}
            footerHeight={60}
            paddingTop={PADDING}
            paddingBottom={PADDING}
            chunkSize={virtualChunkSize}
        />
    );
}
```

**Key points**:
- Use `ListScrollerThin` for lists >50 items
- Group items into rows for grid layouts
- Calculate `rowHeight` and `virtualChunkSize` properly
- Include buffer rows for smooth scrolling
- Use `useMemo` for expensive calculations
- Use `useCallback` for render functions

---

## Pattern 9: Pagination and Data Loading

**Problem**: How to load data in chunks with pagination.

**Solution**:
```typescript
import { RestAPI, Constants } from "@webpack/common";
import { Logger } from "@utils/Logger";

const logger = new Logger("MyPlugin");

const FETCH_TIMEOUT_MS = 10_000;

async function fetchChunk(args: {
    channelId: string;
    before: string | null;
    limit: number;
    signal?: AbortSignal;
}): Promise<Item[]> {
    if (args.signal && args.signal.aborted) {
        throw new Error("AbortError");
    }

    try {
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(args.channelId),
            query: {
                limit: args.limit,
                ...(args.before ? { before: args.before } : {})
            },
            retries: 1
        });

        if (args.signal && args.signal.aborted) {
            throw new Error("AbortError");
        }

        return res.body || [];
    } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            throw e;
        }
        logger.error("Failed to fetch chunk", e);
        throw new Error("fetch_failed");
    }
}

// In component
const loadNextChunks = useCallback(async (chunks: number) => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
        let before = oldestItemId;
        let localHasMore = hasMore;
        const newItems: Item[] = [];

        for (let i = 0; i < chunks && localHasMore; i++) {
            const items = await fetchChunk({
                channelId,
                before,
                limit: chunkSize,
                signal: controller.signal
            });

            if (!items.length) {
                localHasMore = false;
                break;
            }

            const lastItem = items[items.length - 1];
            if (lastItem?.id) {
                before = String(lastItem.id);
            } else {
                localHasMore = false;
                break;
            }

            newItems.push(...items);
        }

        // Update state with new items
        setItems(prev => [...prev, ...newItems]);
        setHasMore(localHasMore);
        setOldestItemId(before);
    } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
            setError("Failed to load items");
        }
    } finally {
        loadingRef.current = false;
    }
}, [channelId, hasMore, chunkSize]);
```

**Key points**:
- Use `AbortSignal` for cancellable requests
- Load data in chunks (25-100 items)
- Track `hasMore` flag
- Use `before` parameter for pagination
- Handle abort errors gracefully
- Clean up abort controllers

---

## Pattern 10: Error Boundaries

**Problem**: How to handle errors in injected components.

**Solution**:
```typescript
import ErrorBoundary from "@components/ErrorBoundary";

// Pattern A: Wrap component
const SafeComponent = ErrorBoundary.wrap(MyComponent, {
    noop: true, // Fail silently for non-critical components
    message: "Failed to render MyComponent"
});

// Pattern B: Use as component
<ErrorBoundary noop>
    <MyComponent />
</ErrorBoundary>

// Pattern C: In API registrations
export default definePlugin({
    start() {
        MessageAccessories.addMessageAccessory("my-accessory", (props) => (
            <ErrorBoundary noop>
                <MyAccessory {...props} />
            </ErrorBoundary>
        ));
    }
});
```

**Key points**:
- Always wrap injected components with `ErrorBoundary`
- Use `noop: true` for non-critical components
- Use `ErrorBoundary.wrap()` for function components
- Provide error messages for debugging

---

## Pattern 11: Lifecycle Management

**Problem**: How to properly manage plugin lifecycle.

**Solution**:
```typescript
export default definePlugin({
    start() {
        // 1. Load persisted data
        const savedData = await DataStore.get("myPlugin:data") ?? [];

        // 2. Subscribe to events
        FluxDispatcher.subscribe("EVENT", this.handler);

        // 3. Initialize caches
        this.cache = new Map();

        // 4. Set up timers
        this.intervalId = setInterval(this.updateFunction, 1000);

        // 5. Register UI elements
        HeaderBar.addHeaderBarButton("my-button", this.renderButton, 0);

        // 6. Open initial modals (if needed)
        // this.modalKey = openModal(...);
    },

    stop() {
        // 1. Unsubscribe from events
        FluxDispatcher.unsubscribe("EVENT", this.handler);

        // 2. Clear timers
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // 3. Remove UI elements
        HeaderBar.removeHeaderBarButton("my-button");

        // 4. Close modals
        if (this.modalKey) {
            closeModal(this.modalKey);
            this.modalKey = null;
        }

        // 5. Clear caches
        this.cache.clear();

        // 6. Revert all state
        // Reset all module-level variables
    }
});
```

**Key points**:
- Initialize in `start()`, clean up in `stop()`
- Unsubscribe from all events
- Clear all timers/intervals
- Remove all UI registrations
- Close all modals
- Clear all caches
- Revert all state

---

## Pattern 12: React Hooks Usage

**Problem**: How to use React hooks in plugins.

**Solution**:
```typescript
import { useState, useEffect, useMemo, useCallback, useRef } from "@webpack/common";
import { useAwaiter, useForceUpdater, useIntersection } from "@utils/react";

function MyComponent() {
    // State
    const [count, setCount] = useState(0);
    const [data, setData] = useState<Data | null>(null);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Await promises
    const [asyncData, error, pending] = useAwaiter(() => fetchData(), {
        fallbackValue: null,
        onError: (e) => logger.error(e)
    });

    // Intersection observer
    const [sentinelRef, isIntersecting] = useIntersection();

    // Memoized values
    const filteredItems = useMemo(() => {
        return items.filter(item => item.enabled);
    }, [items]);

    // Callbacks
    const handleClick = useCallback(() => {
        console.log("Clicked!");
    }, []);

    // Effects with cleanup
    useEffect(() => {
        const handler = () => setCount(c => c + 1);
        FluxDispatcher.subscribe("EVENT", handler);

        return () => {
            FluxDispatcher.unsubscribe("EVENT", handler);
        };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    return <div ref={containerRef}>Content</div>;
}
```

**Key points**:
- Import hooks from `@webpack/common`
- Use `useAwaiter` for async operations
- Use `useIntersection` for intersection observer
- Always return cleanup from `useEffect`
- Use `useMemo` for expensive calculations
- Use `useCallback` for stable function references

---

## Pattern 13: Store Access

**Problem**: How to access Discord stores.

**Solution**:
```typescript
import { UserStore, ChannelStore, MessageStore, useStateFromStores } from "@webpack/common";

// In non-React code
const currentUser = UserStore.getCurrentUser();
const channel = ChannelStore.getChannel(channelId);
const messages = MessageStore.getMessages(channelId);

// In React components
function MyComponent() {
    const user = useStateFromStores([UserStore], () => UserStore.getCurrentUser());
    const channel = useStateFromStores(
        [ChannelStore, SelectedChannelStore],
        () => {
            const channelId = SelectedChannelStore.getChannelId();
            return channelId ? ChannelStore.getChannel(channelId) : null;
        }
    );

    return <div>{user.username} in {channel?.name}</div>;
}
```

**Key points**:
- Use stores from `@webpack/common/stores`
- Use `useStateFromStores` in React components
- Include all dependencies in the stores array
- Return null for missing data

---

## Pattern 14: Performance Optimization

**Problem**: How to optimize plugin performance.

**Solution**:
```typescript
import { useMemo, useCallback, LazyComponent } from "@webpack/common";
import { LazyComponent as LazyComponentUtil } from "@utils/lazyReact";

// Lazy load heavy components
const HeavyComponent = LazyComponentUtil(() => import("./HeavyComponent"));

// Memoize expensive calculations
const expensiveValue = useMemo(() => {
    return computeExpensiveValue(data);
}, [data]);

// Stable callbacks
const handleClick = useCallback(() => {
    doSomething(id);
}, [id]);

// Debounce operations
import { debounce } from "@utils";

const debouncedSearch = useMemo(
    () => debounce((query: string) => {
        performSearch(query);
    }, 300),
    []
);

// Performance tracking
const perfTimers = new Map<string, number>();

function perfStart(name: string) {
    perfTimers.set(name, performance.now());
}

function perfEnd(name: string) {
    const start = perfTimers.get(name);
    if (start !== undefined) {
        const duration = performance.now() - start;
        logger.debug(`[perf] ${name} (${duration.toFixed(2)} ms)`);
        perfTimers.delete(name);
    }
}
```

**Key points**:
- Lazy load heavy components
- Memoize expensive calculations
- Use stable callbacks
- Debounce frequent operations
- Track performance for optimization

---

## Pattern 15: Type Safety

**Problem**: How to maintain type safety.

**Solution**:
```typescript
import type { Channel, Message, User, Guild } from "@vencord/discord-types";

// Type function parameters
function processChannel(channel: Channel | null | undefined): boolean {
    if (!channel) return false;
    // Now channel is typed as Channel
    return channel.guild_id !== null;
}

// Type plugin settings
const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        default: true
    }
} as const);

// Type API responses
interface MyAPIResponse {
    items: Item[];
    hasMore: boolean;
}

async function fetchData(): Promise<MyAPIResponse> {
    const res = await RestAPI.get({ url: "/endpoint" });
    return res.body as MyAPIResponse;
}

// Type guards
function isItem(item: unknown): item is Item {
    return typeof item === "object" && item !== null && "id" in item;
}
```

**Key points**:
- Use types from `@vencord/discord-types`
- Type function parameters and returns
- Use type guards for runtime checks
- Avoid `any` unless absolutely necessary
- Use `as const` for literal types

---

## Summary

**Essential Patterns**:
1. Plugin definition with settings
2. Flux event subscriptions with cleanup
3. Context menu patches
4. Code patching with predicates
5. UI button injection
6. Modal management
7. Virtualized lists for >50 items
8. Pagination with AbortSignal
9. Error boundaries for all injected components
10. Complete lifecycle management
11. React hooks with cleanup
12. Store access patterns
13. Performance optimization
14. Type safety

**Always follow these patterns. They are proven and tested.**

