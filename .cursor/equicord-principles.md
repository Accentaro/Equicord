# Equicord Development Principles

**These are immutable laws. Violations are architectural failures.**

---

## Core Doctrine

### 1. Never Invent Functionality When Internals Already Exist

**Law**: Before writing any helper function, utility, component, or abstraction, you MUST exhaustively search the codebase for existing implementations.

**Enforcement**:
- If functionality exists in `@api`, `@utils`, `@components`, or `@webpack/common`, you MUST use it.
- If similar functionality exists, you MUST adapt your approach to use it.
- Creating new abstractions is ONLY permitted when:
  1. You have confirmed no similar functionality exists across ALL directories
  2. The functionality is genuinely novel and cannot be composed from existing parts
  3. You have documented why existing solutions are insufficient

**Violation Examples**:
- ❌ Creating a custom `debounce` function when `@utils` exports `debounce`
- ❌ Creating a custom modal system when `@utils/modal` exists
- ❌ Creating a custom button component when `@components/Button` exists
- ❌ Creating a custom storage solution when `@api/DataStore` exists

---

### 2. Patch, Wire, or Compose — Do Not Reimplement

**Law**: Equicord is a framework. Your job is to discover existing patch points, APIs, and components, then wire them together. Reimplementing Discord functionality is forbidden.

**Enforcement**:
- Use patches to modify Discord's behavior, not replace it
- Use APIs to extend Discord's UI, not recreate it
- Compose existing components, don't build new ones
- Wire existing stores and utilities, don't duplicate them

**Violation Examples**:
- ❌ Recreating Discord's message rendering instead of using `MessageAccessories`
- ❌ Recreating Discord's context menu system instead of using `ContextMenu` API
- ❌ Recreating Discord's command system instead of using `Commands` API
- ❌ Recreating Discord's store system instead of using `@webpack/common/stores`

---

### 3. Performance, Virtualization, and Discord-Native UX

**Law**: All UI must respect Discord's performance constraints, use virtualization for lists, and maintain Discord-native UX patterns.

**Enforcement**:

#### Virtualization Requirements
- **Lists with >50 items**: MUST use `ListScrollerThin`, `ListScrollerAuto`, or `ListScrollerNone`
- **Grids with >50 items**: MUST use `ListScrollerThin` with row-based virtualization
- **Never render all items**: Use `renderRow` with `rowHeight` and `sectionHeight`
- **Buffer rows**: Include buffer rows (typically 1-3) for smooth scrolling

#### Performance Requirements
- **Lazy loading**: Use `LazyComponent` for heavy components
- **Memoization**: Use `useMemo` for expensive computations
- **Debouncing**: Debounce search/filter operations (use `@utils` `debounce`)
- **Pagination**: Load data in chunks, not all at once
- **Abort controllers**: Use `AbortSignal` for cancellable async operations

#### UX Requirements
- **Discord-native UI**: Use Discord components from `@webpack/common` (Button, TextInput, Select, etc.)
- **Consistent styling**: Use Discord CSS variables and classes
- **Keyboard navigation**: Support standard Discord keyboard shortcuts
- **Accessibility**: Follow Discord's ARIA patterns

**Violation Examples**:
- ❌ Rendering 1000 items without virtualization
- ❌ Loading all messages at once instead of pagination
- ❌ Creating custom UI that doesn't match Discord's design
- ❌ Ignoring keyboard navigation

---

### 4. Banned Practices (Absolute Prohibitions)

**Law**: These practices are architecturally forbidden. They break Discord's architecture, cause performance issues, and create maintenance nightmares.

#### DOM Manipulation
- ❌ **NEVER** use `document.querySelector`, `querySelectorAll`, `getElementById`, `getElementsByClassName`
- ❌ **NEVER** use hardcoded class selectors from Discord markup
- ❌ **NEVER** manually traverse or modify the DOM
- ✅ **USE** React components, patches, and APIs instead

#### Observers
- ❌ **NEVER** use `MutationObserver`
- ❌ **NEVER** use `ResizeObserver` (use `ResizeObserver` from React hooks if needed)
- ❌ **NEVER** use `IntersectionObserver` (use `useIntersection` from `@utils/react`)
- ✅ **USE** React state, stores, and event listeners instead

#### Inline Styles for Layout
- ❌ **NEVER** use `style={{ height, overflow, padding }}` for layout/structure
- ✅ **USE** CSS classes with `className`
- ✅ **ALLOWED**: Inline styles for dynamic values (colors, sizes from props)

#### Manual State Management
- ❌ **NEVER** create ad-hoc state management systems
- ❌ **NEVER** use global variables for state
- ✅ **USE** React hooks (`useState`, `useReducer`)
- ✅ **USE** Discord stores from `@webpack/common/stores`
- ✅ **USE** `@api/DataStore` for persistence

#### Manual Scrolling
- ❌ **NEVER** manually set `scrollTop` or `scrollLeft` (except for scroll restoration)
- ❌ **NEVER** create custom scroll containers
- ✅ **USE** `ScrollerThin`, `ListScrollerThin`, or Discord's native scrolling

#### Direct Webpack Access
- ❌ **NEVER** directly access `window.webpackChunkdiscord_app`
- ❌ **NEVER** use `wreq` directly (use `@webpack` utilities)
- ✅ **USE** `findByProps`, `findByCode`, `findStore` from `@webpack`
- ✅ **USE** `@webpack/common` exports

---

### 5. Lifecycle and Cleanup

**Law**: All plugins MUST properly clean up in `stop()`. No side effects may persist after plugin disable.

**Enforcement**:
- **Unsubscribe** from all Flux events in `stop()`
- **Remove** all patches, context menus, buttons, etc. in `stop()`
- **Clear** all timers, intervals, and timeouts in `stop()`
- **Close** all WebSocket connections in `stop()`
- **Clear** all caches and state in `stop()`
- **Revert** all injected state in `stop()`

**Violation Examples**:
- ❌ Subscribing to Flux events without unsubscribing
- ❌ Adding context menu patches without removing them
- ❌ Creating timers without clearing them
- ❌ Leaving DOM modifications after disable

---

### 6. Type Safety and Error Handling

**Law**: All code MUST be type-safe and handle errors gracefully.

**Enforcement**:
- **TypeScript**: Use proper types, avoid `any` unless absolutely necessary
- **Error boundaries**: Wrap injected components with `ErrorBoundary`
- **Try-catch**: Handle async operations with try-catch
- **Null checks**: Validate objects before accessing properties
- **Early returns**: Use early returns for validation

**Violation Examples**:
- ❌ Using `as any` without justification
- ❌ Injecting components without `ErrorBoundary`
- ❌ Accessing properties without null checks
- ❌ Ignoring promise rejections

---

### 7. Settings and Configuration

**Law**: All user-configurable options MUST use `definePluginSettings()` from `@api/Settings`.

**Enforcement**:
- **Settings API**: Use `definePluginSettings()` for all settings
- **DataStore**: Use `@api/DataStore` for large/complex data
- **localStorage**: Only for simple flags (prefer Settings API)
- **Validation**: Use `isValid` for number/string validation
- **Defaults**: Always provide sensible defaults

**Violation Examples**:
- ❌ Using `localStorage` directly for complex data
- ❌ Creating custom settings systems
- ❌ Hardcoding configuration values
- ❌ Missing validation for user input

---

## Summary

**Equicord is a framework, not a blank slate.**

Your job is to:
1. **Discover** existing functionality
2. **Compose** existing components and APIs
3. **Patch** Discord's behavior when needed
4. **Wire** everything together

You are NOT:
1. Creating new abstractions
2. Reimplementing Discord features
3. Building custom UI systems
4. Managing state manually

**When in doubt, search the codebase first. Always.**

