# Codex-style Layout Redesign

## Context

Current layout uses a light-blue sidebar panel + dark titlebar + floating workspace card. The goal is to replicate the Codex desktop app layout where:
- The entire window has a uniform light background
- The sidebar sits directly on this background with no separate panel
- Only the main content area is a floating white card with rounded corners and shadow
- Title/drag area and window controls sit on the window background, not inside the card

## Layout Structure

```
+--- light gray background (entire window) ---------------+
|  Title (drag area)                      [-] [box] [x]   |
|                                                          |
|  Sidebar area       +--- floating white card -------+    |
|  (on window bg,     |                               |    |
|   no panel bg)      |       main content             |    |
|                     |       (chat / empty state)     |    |
|  - New thread       |                               |    |
|  - Skills           |       [composer input]         |    |
|  - Automations      |       Local v  Model v         |    |
|                     |                               |    |
|  Threads            +-------------------------------+    |
|   - session 1       +--- Terminal placeholder ------+    |
|   - session 2       | Terminal                   x  |    |
|                     | _                             |    |
|  Settings           +-------------------------------+    |
+----------------------------------------------------------+
```

## Components & Changes

### 1. App.tsx - Layout restructure

**Current:** `grid-cols-[220px_1fr]` with TitleBar inside floating-workspace.

**New:**
- Outer: full-window light background (`bg-[#e8ecf2]` or similar)
- Top row: full-width title bar strip (drag area + window controls) - NOT inside the card
- Below: 2-column grid `grid-cols-[220px_1fr]`
  - Left: Sidebar (no background panel, items on window bg)
  - Right: padded area containing the floating content card + terminal placeholder

```
<main className="h-screen flex flex-col bg-[#e8ecf2]">
  <TitleBar />                    {/* full-width, on window bg */}
  <div className="flex-1 min-h-0 grid grid-cols-[220px_1fr]">
    <Sidebar />                   {/* no panel bg */}
    <div className="p-3 flex flex-col gap-3 min-h-0">
      <div className="floating-card flex-1 ...">  {/* white card */}
        {/* chat content + composer */}
      </div>
      <div className="terminal-placeholder ...">   {/* terminal area */}
        Terminal (placeholder)
      </div>
    </div>
  </div>
</main>
```

### 2. TitleBar.tsx - Light, minimal

**Current:** Dark bg (`bg-shell-950/95`), contains PI logo, nav, panel toggle, window controls.

**New:**
- Transparent/no background, sits on the light window bg
- Left: "New thread" text (or session title) - acts as drag area
- Right: ContextPanel toggle icons + window controls (-, box, x)
- Remove the navigation menu (Chat, History, etc.) - not in Codex
- Remove the PI badge from titlebar
- Height: ~40px, compact

### 3. Sidebar.tsx - No panel background

**Current:** `bg-[#eef2f8]` with border-right.

**New:**
- Remove background color - transparent, sits on window bg
- Remove right border
- Items styled for the light gray background:
  - Navigation items: dark text, hover states
  - Threads section with folder-style grouping (like Codex)
  - Filter + add icons in Threads header
  - Active session highlight with subtle bg
- Settings at bottom

### 4. MessageList.tsx - Codex empty state

**Current:** "新的聊天" heading with feature list.

**New empty state:**
- Centered vertically in the card
- Cloud icon (use `CloudIcon` from heroicons)
- "Let's build" large text
- Project name "first_pi_agent" with dropdown chevron
- All in Chinese equivalent or keep English like Codex

### 5. Composer.tsx - Codex-style input

**Current:** Rounded card with input, attach button, status pills.

**New:**
- Input area at bottom of card, centered
- Placeholder: "Ask Codex anything, @ to add files, / for commands, $ for skills" (Chinese)
- Below input: "+" button, model selector dropdown, send button
- Below composer: "Local v" and "Custom coding levels v" pills
- Simpler, flatter design matching Codex

### 6. Floating Content Card

- White background with rounded corners (`rounded-2xl`)
- Subtle shadow for floating effect
- Contains: header area ("New thread"), chat content, composer
- The card header shows session title + ContextPanel toggle icons

### 7. Terminal Placeholder

- Below the floating card in the right column
- Simple bar with "Terminal" text and close (x) button
- Empty content area
- Can be collapsed/hidden

### 8. ContextPanel - Keep existing

- Remains toggleable from icons in the card header
- Renders inside the floating card on the right side
- Keep existing tabs (Attachments, Session, Steps)

## Styling Approach

- Keep using HeroUI components and their default styling throughout
- No custom color palette — rely on HeroUI's token system
- Color/theme unification will be handled later by adjusting HeroUI tokens
- Only override styles where structurally necessary (e.g., removing sidebar panel bg)

## Files to Modify

1. `src/renderer/src/App.tsx` - Main layout restructure
2. `src/renderer/src/components/TitleBar.tsx` - Light minimal titlebar
3. `src/renderer/src/components/Sidebar.tsx` - Remove panel bg, Codex style
4. `src/renderer/src/components/MessageList.tsx` - New empty state
5. `src/renderer/src/components/Composer.tsx` - Codex-style input
6. `src/renderer/src/styles.css` - Update custom classes, window bg

## Verification

1. Run `pnpm dev` to launch the Electron app
2. Verify the floating card effect - white card on light gray background
3. Verify sidebar has no separate panel, items on window bg
4. Verify window drag works on the title area
5. Verify window controls (minimize/maximize/close) work
6. Verify ContextPanel toggle still works
7. Verify session switching and new session creation work
8. Verify Terminal placeholder is visible below the card
9. Run `pnpm check` to confirm no type errors
