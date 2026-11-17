# Shell Layout Fixed Sidebar Plan

> **For Hermes:** Use this plan task-by-task. Do not change code until the plan is approved.

**Goal:** Remove manual dragging from the left sidebar area, keep the left list effectively fixed with a max width of 350px, preserve the middle session area as the main flexible workspace, and fix the right B/C functional panel drag so Browser panel resizing feels smooth and releases cleanly.

**Architecture:**
- The shell currently has two different resize systems: the left A/B split uses `react-resizable-panels`, and the right B/C panel uses a custom pointer-drag width controller in `App.tsx`.
- The intended shape is: A = fixed chat/session list, B = main session workspace, C = right-side functional panel. The left sidebar should stop participating in user drag resizing.
- Width should be responsive by window size, but bounded: the left sidebar should resolve to a percentage-based width that never exceeds 350px, and long labels should use truncation + tooltip instead of relying on drag width.
- The B/C resize path should avoid React re-rendering the Browser `<webview>` on every pointer move. During drag, update the right panel shell width directly for smooth feedback, then commit the final width once on release.

**Tech Stack:** React, `react-resizable-panels`, TypeScript, Tailwind/CSS, existing Chela shell state in `App.tsx`.

---

### Task 1: Confirm current resize ownership and remove the left-side drag surface

**Objective:** Make the A/B boundary no longer user-draggable.

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/ui/resizable.tsx` if the handle wrapper needs a dedicated no-op or hidden variant
- Modify: `src/renderer/src/styles.css` if any visual handle cleanup is needed

**What to do:**
- Remove the left `ResizableHandle` between the sidebar panel and the main panel, or replace it with a non-interactive fixed spacer if layout spacing is still needed.
- Keep the main shell layout intact so the right panel logic is not disturbed.
- Verify the sidebar is still rendered as the A region, but no longer exposes a drag interaction.

**Verification:**
- The left sidebar no longer shows or accepts a drag handle.
- The left list remains visible as a fixed-width column.

---

### Task 2: Convert the sidebar width rule to a fixed responsive cap

**Objective:** Ensure the left sidebar width is responsive but never exceeds 350px.

**Files:**
- Modify: `src/renderer/src/lib/app-shell.ts`
- Modify: `src/renderer/src/App.tsx`

**What to do:**
- Make the sidebar width resolve from container/window width using the existing percentage-based logic.
- Clamp the resolved width so it never exceeds 350px.
- Keep a sensible minimum so the list remains usable on narrow windows.
- Make sure persisted width state and runtime width state agree after resize/reload.
- Keep the sidebar collapsed/expanded behavior intact.

**Verification:**
- On wide windows, the left sidebar stops at 350px.
- On narrower windows, it shrinks proportionally instead of breaking layout.
- Reloading the app restores a width that still obeys the cap.

---

### Task 3: Make the sidebar content readable without drag resizing

**Objective:** Ensure session titles and project labels stay usable inside the capped sidebar.

**Files:**
- Modify: `src/renderer/src/components/assistant-ui/sidebar.tsx`
- Modify: `src/renderer/src/components/assistant-ui/sidebar.tsx` or shared tooltip helpers if needed

**What to do:**
- Ensure long titles truncate cleanly.
- Add or preserve tooltip hover for truncated labels.
- Confirm the sidebar UI still works with the fixed width assumption.
- Avoid adding visual clutter just to fit text.

**Verification:**
- Long session names do not overflow the sidebar.
- Hovering a truncated title shows the full value.

---

### Task 4: Keep the B/C drag behavior isolated and smooth

**Objective:** Preserve the right panel drag behavior while ensuring it is not affected by the left sidebar change.

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Inspect: `src/renderer/src/components/browser-preview/BrowserPreviewPanel.tsx`
- Inspect: `src/renderer/src/components/assistant-ui/trace-panel.tsx`
- Inspect: `src/renderer/src/components/assistant-ui/diff-panel.tsx`

**What to do:**
- Leave the custom right-panel pointer drag in place.
- Re-check the browser panel case specifically, because that is where the current drag-release feel is worst.
- Avoid calling React `setState` on every pointer move. Apply transient width directly to the right panel shell element while dragging.
- Track `currentWidth` in the drag ref and commit that final width to `rightPanelState` only on pointer release / mouseup fallback / window blur.
- Remove the fixed full-window transparent overlay during drag; it can interfere with handle events and make Browser/webview drag release feel stuck.
- Keep cursor/user-select cleanup centralized and idempotent.
- Confirm the right panel width is still clamped correctly relative to the remaining session area.

**Verification:**
- The right panel can still be dragged open/closed smoothly.
- Browser panel does not leave the cursor in a stuck drag state after mouse release.
- Browser panel resize feedback is immediate during drag and does not re-render the browser panel on every pointer move.
- The middle session area remains readable and does not collapse below the intended minimum.

---

### Task 5: Update docs and run targeted checks

**Objective:** Record the layout decision and verify the changed files without doing a full build.

**Files:**
- Create/modify: `docs/changes/2026-05-11/changes.md`
- Modify: `docs/browser-workspace-acceptance.md` only if the drag behavior changes the browser验收 path

**What to do:**
- Write a short change log entry for the shell layout decision.
- Run targeted TypeScript checks for the shell-related files only.
- Do not run a full build unless something unexpected appears.

**Verification commands:**
```bash
pnpm exec tsc --noEmit --pretty false 2>&1 | grep -E 'App.tsx|sidebar.tsx|resizable.tsx|app-shell.ts|BrowserPreviewPanel|trace-panel|diff-panel' || true
```

Expected:
- No output for the targeted files.
- If there is output, inspect only the touched shell layout files first.

---

## Acceptance Criteria

- Left sidebar no longer behaves like a draggable panel.
- Left sidebar width is responsive but capped at 350px.
- Long labels are readable via truncation + tooltip.
- Right-side functional panel still drags correctly.
- Browser panel drag release no longer feels stuck or broken.
- The change is documented in `docs/changes/2026-05-11/changes.md`.

## Out of Scope

- No redesign of the sidebar content hierarchy.
- No changes to session data model.
- No new panels or right-side tools.
- No full build.
