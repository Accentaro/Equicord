# Equicord UI Rules

**Rules governing all UI work in Equicord plugins.**

**These are immutable laws. Violations break Discord's UX and performance.**

---

## Component Reuse Requirements

### Scrollers (MANDATORY for Lists)

**Law**: Lists with >50 items MUST use Discord's virtualized scrollers.

**Required components**:
- `ScrollerThin` — Thin scrollbar (most common)
- `ScrollerAuto` — Auto-showing scrollbar
- `ScrollerNone` — Hidden scrollbar
- `ListScrollerThin` — Virtualized list with thin scrollbar
- `ListScrollerAuto` — Virtualized list with auto scrollbar
- `ListScrollerNone` — Virtualized list with hidden scrollbar

**When to use**:
- `ScrollerThin`/`ScrollerAuto`/`ScrollerNone` — For non-virtualized content (settings, modals, etc.)
- `ListScrollerThin`/`ListScrollerAuto`/`ListScrollerNone` — For virtualized lists/grids with >50 items

**Usage**:
```typescript
import { ScrollerThin, ListScrollerThin } from "@webpack/common";

// Non-virtualized content
<ScrollerThin>
    <div>Content here</div>
</ScrollerThin>

// Virtualized list
<ListScrollerThin
    sections={[totalRows]}
    sectionHeight={0}
    rowHeight={rowHeight}
    renderSection={() => null}
    renderRow={renderRow}
    renderFooter={renderFooter}
    footerHeight={60}
    paddingTop={PADDING}
    paddingBottom={PADDING}
    chunkSize={virtualChunkSize}
/>
```

**Violation Examples**:
- ❌ Rendering 1000 items without virtualization
- ❌ Creating custom scroll containers
- ❌ Using `div` with `overflow: auto` for large lists
- ❌ Not using `ListScrollerThin` for grids

---

### Buttons (MANDATORY)

**Law**: All buttons MUST use existing button components.

**Required components**:
- `Button` from `@components/Button` — Standard button
- `LinkButton` from `@components/Button` — Link-styled button
- `TextButton` from `@components/Button` — Text-only button
- `Button` from `@webpack/common` — Discord's native button
- `HeaderBarButton` from `@api/HeaderBar` — Header bar button
- `ChatBarButton` from `@api/ChatButtons` — Chat bar button

**When to use**:
- `@components/Button` — For plugin UI (settings, modals)
- `@webpack/common` Button — For Discord-native UI
- `HeaderBarButton`/`ChatBarButton` — For specific injection points

**Violation Examples**:
- ❌ Creating custom button components
- ❌ Using `<button>` directly
- ❌ Styling divs to look like buttons

---

### Form Controls (MANDATORY)

**Law**: All form controls MUST use existing components.

**Required components**:
- `FormSwitch` from `@components/FormSwitch` — Switch with title/description
- `Switch` from `@components/Switch` — Basic switch
- `TextInput` from `@webpack/common` — Text input
- `TextArea` from `@webpack/common` — Text area
- `Select` from `@webpack/common` — Select dropdown
- `SearchableSelect` from `@webpack/common` — Searchable select
- `Slider` from `@webpack/common` — Slider control
- `CheckedTextInput` from `@components/CheckedTextInput` — Text input with validation

**Violation Examples**:
- ❌ Creating custom switch components
- ❌ Using `<input>` directly
- ❌ Creating custom select dropdowns

---

### Text Components (MANDATORY)

**Law**: All text MUST use existing text components.

**Required components**:
- `BaseText` from `@components/BaseText` — Base text with size/weight/color
- `Heading` from `@components/Heading` — Heading component
- `Paragraph` from `@components/Paragraph` — Paragraph component
- `Span` from `@components/Span` — Inline span component

**Text sizes**: `xxs`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl`
**Text weights**: `thin`, `extralight`, `light`, `normal`, `medium`, `semibold`, `bold`, `extrabold`
**Text colors**: `text-default`, `text-muted`, `text-link`, `text-danger`, `text-brand`, `text-strong`, `text-subtle`

**Violation Examples**:
- ❌ Using inline styles for text sizing
- ❌ Creating custom text components
- ❌ Using `<h1>`, `<p>`, `<span>` directly without components

---

### Layout Components (MANDATORY)

**Law**: All layout MUST use existing layout components or CSS classes.

**Required components**:
- `Flex` from `@components/Flex` — Flexbox container
- `Grid` from `@components/Grid` — Grid container
- `Divider` from `@components/Divider` — Horizontal divider
- `Card` from `@components/Card` — Card container

**Violation Examples**:
- ❌ Using inline styles for layout (`style={{ display: "flex" }}`)
- ❌ Creating custom layout components
- ❌ Not using CSS classes for layout

---

### Modals (MANDATORY)

**Law**: All modals MUST use the modal system from `@utils/modal`.

**Required components**:
- `ModalRoot` — Root modal component
- `ModalHeader` — Modal header
- `ModalContent` — Modal content
- `ModalFooter` — Modal footer
- `ModalCloseButton` — Close button

**Modal sizes**: `ModalSize.SMALL`, `ModalSize.MEDIUM`, `ModalSize.LARGE`, `ModalSize.DYNAMIC`

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

**Violation Examples**:
- ❌ Creating custom modal systems
- ❌ Using Discord's modal components directly without the API
- ❌ Not using `openModal` for modal management

---

## Discord-Native UI Requirements

### When Discord-Native UI MUST Be Used

**Law**: If Discord has a component for a UI pattern, you MUST use it.

**Required patterns**:
- **Buttons** → `@webpack/common` Button
- **Text inputs** → `@webpack/common` TextInput
- **Selects** → `@webpack/common` Select
- **Avatars** → `@webpack/common` Avatar
- **Tooltips** → `@webpack/common` Tooltip
- **Timestamps** → `@webpack/common` Timestamp
- **Color pickers** → `@webpack/common` ColorPicker
- **Paginators** → `@webpack/common` Paginator

**Violation Examples**:
- ❌ Creating custom avatar components
- ❌ Creating custom tooltip systems
- ❌ Creating custom timestamp components
- ❌ Recreating Discord's UI patterns

---

## Layout Rules

### Flexbox

**Law**: Use `Flex` component or CSS classes for flexbox layouts.

**Required**:
- Use `Flex` component from `@components/Flex`
- Or use Discord's flex classes with proper props

**Violation Examples**:
- ❌ Using inline `style={{ display: "flex" }}`
- ❌ Not using proper flex containers

---

### Grid Layouts

**Law**: Use `Grid` component or CSS classes for grid layouts.

**Required**:
- Use `Grid` component from `@components/Grid`
- Or use CSS Grid with proper classes

**Violation Examples**:
- ❌ Using inline `style={{ display: "grid" }}`
- ❌ Not using proper grid containers

---

### Min-Height and Containers

**Law**: Use proper container classes and avoid fixed heights.

**Required**:
- Use Discord's container classes
- Use `min-height` instead of fixed `height` when possible
- Use `box-sizing: border-box` for all containers

**Violation Examples**:
- ❌ Using fixed heights that break on different screen sizes
- ❌ Not using `box-sizing: border-box`

---

## Virtualization Rules

### When Virtualization Is Required

**Law**: Lists/grids with >50 items MUST be virtualized.

**Required**:
- Use `ListScrollerThin` for virtualized lists
- Calculate `rowHeight` and `sectionHeight` properly
- Use `renderRow` to render individual rows
- Include buffer rows (typically 1-3) for smooth scrolling
- Use `chunkSize` to control virtualization chunk size

**Example**:
```typescript
const { rows, totalRows } = useMemo(() => {
    const rowsArr: Item[][] = [];
    for (let i = 0; i < items.length; i += columns) {
        rowsArr.push(items.slice(i, i + columns));
    }
    return { rows: rowsArr, totalRows: rowsArr.length };
}, [items, columns]);

const virtualChunkSize = useMemo(() =>
    Math.max(rowsPerViewport + BUFFER_ROWS, Math.max(1, rowsPerViewport)),
    [rowsPerViewport]
);

<ListScrollerThin
    sections={[totalRows]}
    sectionHeight={0}
    rowHeight={gridLayout.rowHeight}
    renderRow={({ rowIndex }) => renderRow(rows[rowIndex])}
    chunkSize={virtualChunkSize}
/>
```

**Violation Examples**:
- ❌ Rendering all items without virtualization
- ❌ Not calculating `rowHeight` properly
- ❌ Not using buffer rows
- ❌ Not using `chunkSize`

---

## Scrolling and Pagination Rules

### Scrolling

**Law**: NEVER manually control scrolling except for scroll restoration.

**Required**:
- Use Discord's scroller components
- Let Discord handle scrolling
- Only set `scrollTop` for scroll restoration after loading

**Allowed**:
```typescript
// Scroll restoration after loading
useEffect(() => {
    if (!isLoading && savedScrollTop > 0) {
        scrollerRef.current.scrollTop = Math.min(
            savedScrollTop,
            scrollerRef.current.scrollHeight - scrollerRef.current.clientHeight
        );
    }
}, [isLoading]);
```

**Violation Examples**:
- ❌ Manually setting `scrollTop` during normal scrolling
- ❌ Creating custom scroll containers
- ❌ Using `scrollIntoView` unnecessarily

---

### Pagination

**Law**: Load data in chunks, not all at once.

**Required**:
- Use `AbortSignal` for cancellable requests
- Load data incrementally (e.g., 50 items at a time)
- Use `hasMore` flag to track if more data exists
- Load more when approaching bottom (use intersection observer or scroll events)

**Example**:
```typescript
const loadNextChunks = useCallback(async (chunks: number) => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    const controller = new AbortController();

    try {
        const messages = await fetchMessagesChunk({
            channelId,
            before: oldestMessageId,
            limit: chunkSize,
            signal: controller.signal
        });
        // Process messages...
    } catch (e) {
        if (e.name !== "AbortError") {
            // Handle error
        }
    } finally {
        loadingRef.current = false;
    }
}, [channelId, hasMore, chunkSize]);
```

**Violation Examples**:
- ❌ Loading all data at once
- ❌ Not using `AbortSignal` for cancellable requests
- ❌ Not implementing proper pagination

---

## Thumbnail vs Fullscreen Media

### Thumbnail Behavior

**Law**: Thumbnails MUST be optimized and lazy-loaded.

**Required**:
- Use `proxyUrl` when available (Discord's CDN proxy)
- Add size parameters to URLs for thumbnails
- Use lazy loading for images
- Handle loading states and errors

**Example**:
```typescript
function getThumbUrl(item: GalleryItem, size: number): string {
    const url = item.proxyUrl ?? item.url;
    if (item.isAnimated) return url; // Don't resize animated
    return withSizeParams(url, size); // Add width/height params
}
```

---

### Fullscreen Behavior

**Law**: Fullscreen media MUST use Discord's media modal.

**Required**:
- Use `openMediaModal` from `@utils/modal` for images/videos
- Or use `openImageModal` from `@utils/discord` for single images
- Pass proper media item structure

**Example**:
```typescript
import { openImageModal } from "@utils/discord";

openImageModal({
    url: item.url,
    original: item.url,
    width: item.width,
    height: item.height,
    animated: item.isAnimated
});
```

**Violation Examples**:
- ❌ Creating custom fullscreen viewers
- ❌ Not using Discord's media modal
- ❌ Not handling animated images properly

---

## Accessibility and Keyboard Behavior

### Keyboard Navigation

**Law**: All interactive elements MUST support keyboard navigation.

**Required**:
- Use proper `tabIndex` for focusable elements
- Support `Enter` and `Space` for activation
- Support `Escape` for closing modals/dialogs
- Use proper ARIA attributes

**Violation Examples**:
- ❌ Not supporting keyboard navigation
- ❌ Missing ARIA attributes
- ❌ Not handling `Escape` key

---

### ARIA Attributes

**Law**: All interactive elements MUST have proper ARIA attributes.

**Required**:
- Use `aria-label` for buttons without visible text
- Use `aria-labelledby` for elements with labels
- Use `role` attributes where appropriate
- Use `aria-hidden` for decorative elements

**Violation Examples**:
- ❌ Missing `aria-label` on icon buttons
- ❌ Not using proper ARIA roles
- ❌ Not hiding decorative elements

---

## CSS and Styling Rules

### CSS Classes

**Law**: Use CSS classes, not inline styles for layout.

**Required**:
- Put all layout styles in CSS files
- Use `className` for styling
- Use Discord CSS variables for colors
- Prefix plugin classes with `vc-` or `vc-plugin-name-`

**Allowed**:
```typescript
// Dynamic values are OK
<div style={{ color: dynamicColor, width: dynamicWidth }} />
```

**Violation Examples**:
- ❌ Using inline styles for layout (`style={{ height: "100%", padding: "10px" }}`)
- ❌ Not using CSS classes
- ❌ Not using Discord CSS variables

---

### Managed CSS

**Law**: Use managed CSS (`?managed` suffix) for plugin styles.

**Required**:
- Import CSS with `?managed` suffix: `import "./style.css?managed"`
- Managed CSS auto-enables/disables with plugin
- Do NOT manually call `enableStyle`/`disableStyle` in `start`/`stop`

**Violation Examples**:
- ❌ Manually enabling/disabling managed CSS
- ❌ Not using `?managed` suffix
- ❌ Using regular CSS imports when managed CSS is needed

---

## Error Handling in UI

### Error Boundaries

**Law**: All injected components MUST be wrapped with ErrorBoundary.

**Required**:
- Use `ErrorBoundary` from `@components/ErrorBoundary`
- Use `ErrorBoundary.wrap()` for function components
- Use `noop: true` for non-critical components

**Example**:
```typescript
import ErrorBoundary from "@components/ErrorBoundary";

// Wrap component
const SafeComponent = ErrorBoundary.wrap(MyComponent, {
    noop: true,
    message: "Failed to render MyComponent"
});

// Or use as component
<ErrorBoundary noop>
    <MyComponent />
</ErrorBoundary>
```

**Violation Examples**:
- ❌ Not wrapping injected components
- ❌ Not using ErrorBoundary for user-facing components
- ❌ Not handling errors gracefully

---

## Summary

**MANDATORY Components**:
- Scrollers: `ScrollerThin`, `ListScrollerThin` (for >50 items)
- Buttons: `Button` from `@components` or `@webpack/common`
- Form controls: `FormSwitch`, `TextInput`, `Select`, etc.
- Text: `BaseText`, `Heading`, `Paragraph`, `Span`
- Layout: `Flex`, `Grid`, `Divider`, `Card`
- Modals: `ModalRoot`, `ModalHeader`, `ModalContent`, etc.

**MANDATORY Patterns**:
- Virtualization for lists >50 items
- Discord-native UI when available
- CSS classes for layout (not inline styles)
- Error boundaries for all injected components
- Keyboard navigation support
- Proper ARIA attributes

**FORBIDDEN**:
- Custom button/form/text components
- Manual scrolling (except restoration)
- Inline styles for layout
- Non-virtualized large lists
- Custom modal systems
- Missing error boundaries

