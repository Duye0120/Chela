# Codex-Style Layout Redesign - Implementation Plan

## Context

The app currently has a sidebar with its own light-blue panel background and a dark titlebar inside a floating workspace card. The goal is to replicate the Codex desktop layout: the entire window has a uniform light background, the sidebar sits directly on it (no panel), the titlebar moves to the window level, and only the content area is a floating white card. Terminal placeholder below the card. HeroUI styling retained as-is.

## Batch A: Foundation (background colors)

### Step 1: Main process background
**File:** `src/main/index.ts` (line 38)
- Change `backgroundColor: "#0b0d12"` to `backgroundColor: "#e8ecf2"` to prevent dark flash on startup

### Step 2: CSS background
**File:** `src/renderer/src/styles.css`
- `:root` background: `#f7f7f4` → `#e8ecf2`
- `body` background: remove the radial+linear gradient, replace with `background: #e8ecf2`
- Keep all existing component classes (`.floating-workspace::before`, `.titlebar-control`, etc.)

### Step 3: HTML body class
**File:** `src/renderer/index.html` (line 8)
- Change `class="bg-shell-950"` to `class="bg-[#e8ecf2]"`

## Batch B: Core layout restructure

### Step 4: App.tsx + TitleBar.tsx — restructure layout
**Files:** `src/renderer/src/App.tsx`, `src/renderer/src/components/TitleBar.tsx`

**App.tsx layout change (main return):**
```
<main flex-col h-screen bg-[#e8ecf2]>
  <TitleBar />                              ← full-width, on window bg
  <div grid-cols-[220px_1fr] flex-1>
    <Sidebar />                             ← no panel bg
    <div flex-col gap-3 p-3 pl-0>           ← right column
      <div.floating-workspace flex-1>       ← white rounded card
        <card-header>                       ← "新线程" + ContextPanel toggle icons
        <div grid chat + contextpanel>
          <section chat>
            <MessageList />
            <Composer />
          </section>
          <ContextPanel />
        </div>
      </div>
      <div terminal-placeholder>            ← "Terminal" + close button, empty
      </div>
    </div>
  </div>
</main>
```

Key changes:
- `<main>` becomes `flex flex-col` instead of `grid grid-cols-[220px_1fr]`
- TitleBar moves OUT of floating card → first child of `<main>`
- Add 2-col grid (`grid-cols-[220px_1fr]`) below TitleBar
- Floating card: `rounded-2xl border border-black/8 bg-white shadow-[0_20px_50px_rgba(81,98,128,0.16)]`
- Card header inside floating card: session title left, ContextPanel toggle right
- Terminal placeholder: below card, `rounded-2xl border bg-white`, shows "Terminal" + x button
- Move `RectangleGroupIcon` import from TitleBar to App (for panel toggle in card header)
- Remove old inline header (聊天 dropdown, topSummary) — replace with simple card header
- Remove `topSummary` useMemo
- Remove `ChevronDownIcon` import from App.tsx (no longer needed here)
- Booting/error screens: change `bg-shell-950` to `bg-[#e8ecf2]`

**TitleBar.tsx changes:**
- Remove props: `rightPanelOpen`, `onToggleRightPanel`
- Remove: PI badge, session title display, nav menu (聊天/历史/附件/帮助), ContextPanel toggle
- Keep only: drag area (full width) + window controls (minimize/maximize/close)
- Change header classes: remove dark bg (`bg-shell-950/95`), remove border-b — transparent on window bg
- Compact height: `h-10`
- Remove unused imports: `RectangleGroupIcon`, `Button` from HeroUI

## Batch C: Component polish (independent, any order)

### Step 5: Sidebar.tsx — remove panel, Codex style
**File:** `src/renderer/src/components/Sidebar.tsx`
- Remove `bg-[#eef2f8]` and `border-r border-black/6` from `<aside>`
- Adjust item styling for window bg: active items use `bg-white/70`, hover uses `bg-white/50`
- Keep same structure: nav items, threads section, settings at bottom

### Step 6: MessageList.tsx — Codex empty state
**File:** `src/renderer/src/components/MessageList.tsx`
- Add imports: `CloudIcon`, `ChevronDownIcon` from heroicons
- Replace empty state: centered cloud icon + "Let's build" + "first_pi_agent ▾"
- Use `flex min-h-full flex-col items-center justify-center` for centering
- Keep message rendering (non-empty state) as-is

### Step 7: Composer.tsx — Codex-style input
**File:** `src/renderer/src/components/Composer.tsx`
- Simplify outer container: remove heavy shadow, use lighter border (`rounded-xl border border-black/8 bg-white`)
- Update placeholder: Codex-style prompt text
- Keep attachment chips, send button, status pills — just lighter styling

## Files to modify

1. `src/main/index.ts` — one line (backgroundColor)
2. `src/renderer/index.html` — one line (body class)
3. `src/renderer/src/styles.css` — background colors
4. `src/renderer/src/App.tsx` — core layout restructure + card header + terminal placeholder
5. `src/renderer/src/components/TitleBar.tsx` — simplify to minimal
6. `src/renderer/src/components/Sidebar.tsx` — remove panel bg
7. `src/renderer/src/components/MessageList.tsx` — new empty state
8. `src/renderer/src/components/Composer.tsx` — lighter styling

## Verification

1. `pnpm check` — no TypeScript errors
2. `pnpm dev` — app launches without dark flash
3. Window drag works on title area, window controls work
4. Sidebar has no panel bg — items on window background
5. Floating white card with shadow is visible
6. Terminal placeholder below the card
7. ContextPanel toggle works from card header
8. Session switching, new session, message sending all work
9. Empty state shows cloud icon + "Let's build" + project name
10. File attachment flow works
