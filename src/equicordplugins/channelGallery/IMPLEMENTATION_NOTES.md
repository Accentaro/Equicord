# ChannelGallery Plugin - Implementation Notes

## State Machine

The plugin uses an explicit state machine with the following modes:

- **`closed`**: Gallery is not open
- **`gallery`**: Gallery grid view is open
- **`single`**: Single image view is open
- **`fullscreen`**: Discord's native fullscreen media modal is open

### State Transitions

1. **Toolbar button click** → `closed` → `gallery`
2. **Thumbnail click** → `gallery` → `single` (with `selectedStableId`)
3. **Fullscreen button click** → `single` → `fullscreen` (opens Discord modal)
4. **Close fullscreen** → `fullscreen` → `single` (restores previous selection)
5. **Close single view** → `single` → `gallery`
6. **Close gallery** → `gallery` → `closed`

### State Management

- Global state is stored in `globalState` object
- State listeners pattern allows components to react to state changes
- State is updated via `setState()` function which notifies all listeners

## Stable ID Selection

### Problem Solved

The original implementation used array indices for selection, which caused:
- First click misselection when items array changed
- Scroll position jumps when items were added/removed
- Index instability during pagination

### Solution

Each gallery item has a **stable ID** in the format: `${messageId}:${url}`

- Stable IDs never change once created
- Selection uses `stableId` instead of index
- Index is derived via `findIndex()` only when needed
- Items array remains stable during selection

### Implementation

```typescript
type GalleryItem = {
    stableId: string; // messageId:url format
    // ... other properties
};

// Selection uses stable ID
onSelect(stableId: string)

// Index derived when needed
const selectedIndex = items.findIndex(item => item.stableId === selectedStableId);
```

## Scrolling and Pagination

### No Observers

The implementation uses **RAF-throttled scroll handlers** instead of IntersectionObserver:

1. **Scroll Event Listener**: Attached to scroll container
2. **RAF Throttling**: `requestAnimationFrame` prevents excessive updates
3. **Threshold Check**: Loads more when within 600px of bottom
4. **Passive Listener**: Uses `{ passive: true }` for better performance

### Implementation

```typescript
const handleScroll = useCallback(() => {
    if (rafIdRef.current !== null) return; // Throttle
    
    rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        // Check distance from bottom
        const distanceFromBottom = el.scrollHeight - scrollTop - el.clientHeight;
        if (distanceFromBottom < LOAD_MORE_THRESHOLD) {
            onLoadMore();
        }
    });
}, [hasMore, isLoading, onLoadMore]);
```

### Benefits

- No IntersectionObserver dependency
- Better performance with RAF throttling
- Works in all browsers
- Predictable behavior

## CSS Grid Layout

### Dynamic Grid Columns

The gallery uses CSS Grid with dynamically calculated columns:

- **Calculation**: Based on viewport width and minimum/maximum thumbnail sizes
- **Responsive**: Automatically adjusts column count
- **No ResizeObserver**: Uses window resize event + RAF

### Implementation

```typescript
const usableWidth = viewport.width - PADDING * 2;
const columns = Math.floor((usableWidth + GAP) / (MIN_THUMB + GAP));
const cell = Math.floor((usableWidth - (columns - 1) * GAP) / columns);

// Applied via inline style (acceptable for dynamic values per ruleset)
style={{ 
    gridTemplateColumns: `repeat(${columns}, ${cell}px)`,
    gap: `${GAP}px`
}}
```

### CSS

```css
.vc-gallery-grid {
    display: grid;
    /* gridTemplateColumns and gap set via inline style */
}
```

## Icon Finder

### Robust Fallback Chain

The icon finder tries multiple methods to find Discord's native gallery icon:

1. **findByDisplayName**: Look for component named "GalleryIcon"
2. **findByPropsLazy**: Look for "GalleryIcon" or "MediaIcon" in props
3. **findComponentByCodeLazy**: Search for components with "gallery", "media", or "image" in code
4. **Fallback**: Custom SVG icon if native icon not found

### Implementation

```typescript
function findGalleryIcon(): React.ComponentType<any> | null {
    try {
        const byDisplayName = findByDisplayName("GalleryIcon", false);
        if (byDisplayName) return byDisplayName;
        
        const byProps = findByPropsLazy("GalleryIcon", "MediaIcon");
        if (byProps?.GalleryIcon) return byProps.GalleryIcon;
        
        const byCode = findComponentByCodeLazy("gallery", "media", "image");
        if (byCode) return byCode;
    } catch (e) {
        // Fall through
    }
    return null;
}

export const GalleryIcon = findGalleryIcon() || FallbackGalleryIcon;
```

## Cleanup and Lifecycle

### Disposer Stack Pattern

The plugin uses a cleanup stack for proper resource management:

```typescript
// In start/component mount
const cleanups: (() => void)[] = [];

// Add cleanup functions
cleanups.push(() => abortController.abort());
cleanups.push(() => window.removeEventListener(...));

// In stop/unmount
cleanups.reverse().forEach(cleanup => cleanup());
```

### Resources Cleaned Up

- AbortControllers for fetch requests
- Event listeners (scroll, resize, keyboard)
- RAF callbacks
- State listeners
- Modal references

## File Structure

```
src/equicordplugins/channelGallery/
├── index.tsx              # Main plugin, state machine, toolbar button
├── components/
│   ├── GalleryView.tsx     # Grid view with stable ID selection
│   ├── SingleView.tsx      # Single image lightbox view
│   └── FullscreenView.tsx # Wrapper for Discord's media modal
├── utils/
│   ├── media.ts           # Image extraction, icon finder
│   └── pagination.ts      # Message fetching
└── style.css              # All styles (no inline layout styles)
```

## Key Improvements

1. **Stable ID Selection**: Eliminates first-click bugs and scroll jumps
2. **Explicit State Machine**: Clear state transitions and mode management
3. **No Observers**: Uses RAF-throttled scroll handlers instead
4. **CSS Grid**: Responsive layout without ResizeObserver
5. **Proper Cleanup**: Disposer stack pattern for all resources
6. **Robust Icon Finder**: Multiple fallback methods for Discord icon
7. **Validation First**: All functions validate inputs before accessing properties
8. **Consolidated Checks**: Related conditions combined for performance
9. **Extracted Handlers**: No complex inline arrow functions in JSX

## Compliance with Ruleset

✅ **No DOM querying**: Uses React refs and component props only  
✅ **No observers**: RAF-throttled scroll handlers instead  
✅ **No inline layout styles**: All layout in CSS, only dynamic values inline  
✅ **Early validation**: Objects validated before property access  
✅ **No redundant checks**: Conditions consolidated  
✅ **Extracted handlers**: All event handlers extracted to functions  
✅ **Proper cleanup**: Disposer stack for all resources  
✅ **State update ordering**: State updates happen in correct sequence  

