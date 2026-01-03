# ChannelGallery Plugin Review

**Review Date**: 2025-01-XX
**Reviewer**: AI Assistant
**Plugin**: `src/equicordplugins/channelGallery/`

---

## Executive Summary

The `channelGallery` plugin is **well-implemented** and follows most Equicord best practices. It demonstrates:
- ✅ Proper use of APIs (`ChannelToolbarButton`, `definePluginSettings`, `ErrorBoundary`)
- ✅ Correct virtualization with `ListScrollerThin`
- ✅ Good performance optimizations (memoization, debouncing, abort controllers)
- ✅ Proper lifecycle management (cleanup in `stop()`)
- ✅ Good error handling (ErrorBoundary, try-catch, error states)

**Issues Found**: 7 minor issues, 0 critical issues

---

## ✅ Strengths

### 1. API Usage (Excellent)
- ✅ Uses `ChannelToolbarButton` from `@api/HeaderBar`
- ✅ Uses `definePluginSettings` correctly
- ✅ Uses `ErrorBoundary.wrap()` for modal
- ✅ Uses `ModalRoot`, `ModalHeader`, `ModalContent`, `ModalCloseButton`
- ✅ Uses `openMediaModal` from `@utils/modal` for fullscreen view

### 2. Component Usage (Excellent)
- ✅ Uses `ListScrollerThin` for virtualized grid (correct!)
- ✅ Uses `Button` from `@components/Button`
- ✅ Uses `Heading` from `@components/Heading`
- ✅ Uses Discord-native components (`ManaSelect`, `ManaDatePicker`, `SearchBar`)

### 3. Virtualization (Excellent)
- ✅ Uses `ListScrollerThin` with proper row-based virtualization
- ✅ Calculates `rowHeight` correctly
- ✅ Uses `chunkSize` for virtualization
- ✅ Groups items into rows for efficient rendering

### 4. Performance (Excellent)
- ✅ Uses `useMemo` for expensive computations (grid layout, filtering, sorting)
- ✅ Uses `useCallback` for event handlers
- ✅ Implements debouncing for search (`SEARCH_DEBOUNCE_MS = 150`)
- ✅ Uses `AbortController` for cancellable async operations
- ✅ Implements pagination (chunks, not all at once)
- ✅ Uses performance tracking (`perfStart`/`perfEnd`)

### 5. Error Handling (Excellent)
- ✅ Wraps modal with `ErrorBoundary.wrap()`
- ✅ Uses try-catch for async operations
- ✅ Implements error states in UI
- ✅ Handles abort errors correctly
- ✅ Marks failed items and filters them out

### 6. Lifecycle Management (Excellent)
- ✅ Cleans up in `stop()` (closes modal)
- ✅ Uses `isMountedRef` to prevent state updates after unmount
- ✅ Cleans up `AbortController` on unmount
- ✅ Removes event listeners in `useEffect` cleanup

### 7. Settings (Excellent)
- ✅ Uses `definePluginSettings` correctly
- ✅ Provides validation with `isValid`
- ✅ Uses settings in components via props

---

## ⚠️ Issues & Recommendations

### Issue 1: Duplicate Performance Tracking Code
**Severity**: Minor
**Location**: `index.tsx:31-49`, `GalleryView.tsx:31-50`, `FullscreenView.tsx:14-33`, `pagination.ts:12-31`

**Problem**: The `perfStart` and `perfEnd` functions are duplicated across multiple files.

**Current Code**:
```typescript
// In index.tsx
const perfTimers = new Map<string, number>();
const MAX_PERF_TIMERS = 100;

function perfStart(name: string): void {
    // ... duplicate code ...
}

function perfEnd(name: string): void {
    // ... duplicate code ...
}
```

**Recommendation**: Extract to a shared utility file.

**Fix**:
```typescript
// In utils/performance.ts
import { Logger } from "@utils/Logger";

const logger = new Logger("ChannelGallery", "#8aadf4");
const perfTimers = new Map<string, number>();
const MAX_PERF_TIMERS = 100;

export function perfStart(name: string): void {
    if (perfTimers.size >= MAX_PERF_TIMERS) {
        const firstKey = perfTimers.keys().next().value;
        if (firstKey) perfTimers.delete(firstKey);
    }
    perfTimers.set(name, performance.now());
}

export function perfEnd(name: string): void {
    const start = perfTimers.get(name);
    if (start === undefined) return;
    perfTimers.delete(name);
    const duration = performance.now() - start;
    logger.debug(`[perf] ${name} (${duration.toFixed(2)} ms)`);
}
```

**Impact**: Reduces code duplication, improves maintainability.

---

### Issue 2: Inline Styles for Layout
**Severity**: Minor
**Location**: `GalleryView.tsx:597-603`

**Problem**: Using inline styles for layout structure instead of CSS classes.

**Current Code**:
```typescript
<div
    className="vc-gallery-row"
    style={{
        display: "flex",
        gap: GAP,
        padding: `0 ${PADDING}px`,
        height: gridLayout.rowHeight,
        alignItems: "flex-start"
    }}
>
```

**Recommendation**: Move layout styles to CSS. Dynamic values (height) can remain inline.

**Fix**:
```css
/* In style.css */
.vc-gallery-row {
    display: flex;
    gap: 10px;
    padding: 0 14px;
    align-items: flex-start;
}
```

```typescript
// In GalleryView.tsx
<div
    className="vc-gallery-row"
    style={{ height: gridLayout.rowHeight }}
>
```

**Impact**: Better separation of concerns, easier to maintain.

---

### Issue 3: Native Button Elements
**Severity**: Minor
**Location**: `index.tsx:452-461`, `SingleView.tsx:277-312`

**Problem**: Using native `<button>` elements instead of `Button` component.

**Current Code**:
```typescript
<button onClick={handleDownload} className="vc-gallery-icon-button" aria-label="Download image">
    <svg>...</svg>
</button>
```

**Recommendation**: Use `Button` component from `@components/Button` or `@webpack/common`.

**Fix**:
```typescript
import { Button } from "@components/Button";

<Button
    onClick={handleDownload}
    variant="none"
    size="small"
    className="vc-gallery-icon-button"
    aria-label="Download image"
>
    <svg>...</svg>
</Button>
```

**Impact**: Consistent styling, better accessibility, follows Equicord patterns.

---

### Issue 4: Type Safety - `jumper` Any Type
**Severity**: Minor
**Location**: `index.tsx:51`, `SingleView.tsx:16`

**Problem**: Using `any` type for `jumper` instead of proper typing.

**Current Code**:
```typescript
const jumper: any = findByPropsLazy("jumpToMessage");
```

**Recommendation**: Create a proper type or use a type assertion.

**Fix**:
```typescript
interface JumpToMessageParams {
    channelId: string;
    messageId: string;
    flash?: boolean;
    jumpType?: string;
}

interface Jumper {
    jumpToMessage(params: JumpToMessageParams): void;
}

const jumper = findByPropsLazy("jumpToMessage") as Jumper;
```

**Impact**: Better type safety, catches errors at compile time.

---

### Issue 5: Window Event Listener in Component
**Severity**: Minor
**Location**: `index.tsx:425-436`

**Problem**: Using `window.addEventListener` directly in component instead of React hooks.

**Current Code**:
```typescript
React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            handleClose(e);
        }
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
}, [handleClose]);
```

**Status**: ✅ **Actually Correct** - This is the proper way to handle global keyboard events in React. The cleanup is correct.

**Note**: This is not an issue. The pattern is correct for global event listeners.

---

### Issue 6: Manual DOM Measurement
**Severity**: Minor (Acceptable)
**Location**: `GalleryView.tsx:303-355`

**Problem**: Using `getBoundingClientRect()` for viewport measurement.

**Current Code**:
```typescript
const updateViewport = () => {
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: rect.width, height: rect.height });
    }
};
```

**Status**: ✅ **Acceptable** - This is a legitimate use case for DOM measurement. The code is properly contained within React hooks and cleaned up correctly.

**Note**: This is not a violation. Measuring viewport size for responsive grid layout is a valid use case.

---

### Issue 7: Missing Error Boundary in Components
**Severity**: Minor
**Location**: `GalleryView.tsx`, `SingleView.tsx`

**Problem**: Child components (`GalleryView`, `SingleView`) are not wrapped in `ErrorBoundary`.

**Current Code**:
```typescript
{isSingleView ? (
    <SingleView ... />
) : (
    <GalleryView ... />
)}
```

**Recommendation**: Wrap child components in `ErrorBoundary` for better error isolation.

**Fix**:
```typescript
import ErrorBoundary from "@components/ErrorBoundary";

{isSingleView ? (
    <ErrorBoundary noop>
        <SingleView ... />
    </ErrorBoundary>
) : (
    <ErrorBoundary noop>
        <GalleryView ... />
    </ErrorBoundary>
)}
```

**Impact**: Better error isolation, prevents one component's error from crashing the entire modal.

---

## 📋 Summary of Recommendations

### High Priority
1. **Extract performance tracking to shared utility** (Issue 1)
2. **Use Button component instead of native buttons** (Issue 3)

### Medium Priority
3. **Move layout styles to CSS** (Issue 2)
4. **Add ErrorBoundary to child components** (Issue 7)
5. **Improve type safety for jumper** (Issue 4)

### Low Priority
6. **Review inline styles** - Some are acceptable (dynamic values)

---

## ✅ Best Practices Followed

1. ✅ **Virtualization**: Correctly uses `ListScrollerThin` for grid
2. ✅ **Pagination**: Loads data in chunks, not all at once
3. ✅ **Performance**: Memoization, debouncing, abort controllers
4. ✅ **Error Handling**: ErrorBoundary, try-catch, error states
5. ✅ **Lifecycle**: Proper cleanup in `stop()`
6. ✅ **Settings**: Uses `definePluginSettings` correctly
7. ✅ **API Usage**: Uses correct APIs from `@api`, `@components`, `@utils`
8. ✅ **Component Reuse**: Uses existing components instead of creating new ones
9. ✅ **Accessibility**: Includes `aria-label` attributes
10. ✅ **Keyboard Navigation**: Supports Escape, Arrow keys, Enter

---

## 🎯 Overall Assessment

**Grade**: **A- (Excellent)**

The plugin is **very well implemented** and follows Equicord best practices. The issues found are minor and mostly related to code organization and consistency rather than architectural problems.

**Key Strengths**:
- Excellent use of virtualization
- Good performance optimizations
- Proper error handling
- Clean lifecycle management

**Areas for Improvement**:
- Code deduplication (performance tracking)
- Component consistency (native buttons → Button component)
- Type safety improvements

---

## 📝 Action Items

1. [ ] Extract `perfStart`/`perfEnd` to shared utility
2. [ ] Replace native `<button>` with `Button` component
3. [ ] Move layout styles to CSS (keep dynamic values inline)
4. [ ] Add `ErrorBoundary` to `GalleryView` and `SingleView`
5. [ ] Improve type safety for `jumper`

---

## 🔍 Code Quality Metrics

- **Lines of Code**: ~1,500 (reasonable for feature complexity)
- **Component Count**: 3 main components (well-organized)
- **Utility Functions**: 2 utility files (good separation)
- **Settings Count**: 5 (appropriate)
- **Performance Optimizations**: 8+ (excellent)
- **Error Handling**: Comprehensive

---

## ✅ Compliance Checklist

- [x] Uses existing APIs (`@api`, `@utils`, `@components`)
- [x] Uses virtualization for large lists (`ListScrollerThin`)
- [x] Uses existing components (Button, Modal, etc.)
- [x] Proper error handling (ErrorBoundary, try-catch)
- [x] Proper lifecycle management (start/stop)
- [x] Performance optimizations (memoization, debouncing)
- [x] No DOM manipulation (except legitimate viewport measurement)
- [x] No MutationObserver/ResizeObserver/IntersectionObserver
- [x] Settings properly defined
- [x] Keyboard navigation support
- [x] Accessibility considerations

---

**Review Complete** ✅

