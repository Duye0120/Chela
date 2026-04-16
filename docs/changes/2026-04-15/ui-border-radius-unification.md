# UI Border Radius Unification

## Change Summary
Replaced arbitrary hardcoded border radii across the application with the standardized `var(--radius-shell)` design token.

## Affected Components
- **assistant-ui modules:**
  - agent-activity-bar.tsx
  - approval-notice-bar.tsx 
  - attachment.tsx
  - context-summary-trigger.tsx
  - diff-panel.tsx
  - sidebar.tsx
  - terminal-drawer.tsx
  - thread.tsx
  - title-bar.tsx

## Problem Addressed
Previously, border radiuses severely varied between components (ounded-[6px], ounded-[12px], ounded-[16px], ounded-[24px], etc.), causing a disjointed visual language.

## Design Rule Adopted
- Use ounded-[var(--radius-shell)] for all shell elements (bubbles, headers, panels, sidebars) to align completely with the central CSS token.
