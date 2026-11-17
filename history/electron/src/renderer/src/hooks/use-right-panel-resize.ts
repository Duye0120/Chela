import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { RightPanelState } from "@shared/contracts";
import {
  RIGHT_PANEL_GAP_PX,
  clampRightPanelWidth,
} from "@renderer/lib/app-shell";

type RightPanelResizeState = {
  startX: number;
  startWidth: number;
  currentWidth: number;
  containerWidth: number;
  pointerId: number;
  handle: HTMLDivElement;
};

export type UseRightPanelResizeInput = {
  active: boolean;
  threadWorkspaceRef: RefObject<HTMLDivElement | null>;
  rightPanelShellRef: RefObject<HTMLDivElement | null>;
  threadWorkspaceWidth: number;
  resolvedRightPanelWidth: number;
  setRightPanelDragging: (dragging: boolean) => void;
  updateRightPanelState: (partial: Partial<RightPanelState>) => void;
};

export function useRightPanelResize({
  active,
  threadWorkspaceRef,
  rightPanelShellRef,
  threadWorkspaceWidth,
  resolvedRightPanelWidth,
  setRightPanelDragging,
  updateRightPanelState,
}: UseRightPanelResizeInput): {
  cleanupRightPanelResize: () => void;
  handleRightPanelResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
} {
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<RightPanelResizeState | null>(null);

  const cleanupRightPanelResize = useCallback(() => {
    dragCleanupRef.current?.();
  }, []);

  const handleRightPanelResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!active) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const element = threadWorkspaceRef.current;
      const shellElement = rightPanelShellRef.current;
      const containerWidth = Math.round(
        element?.getBoundingClientRect().width ?? threadWorkspaceWidth,
      );
      const startWidth = resolvedRightPanelWidth;

      dragCleanupRef.current?.();

      dragStateRef.current = {
        startX: event.clientX,
        startWidth,
        currentWidth: startWidth,
        containerWidth,
        pointerId: event.pointerId,
        handle: event.currentTarget,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the pointer was cancelled before React handled it.
      }
      setRightPanelDragging(true);
      const previousBodyCursor = document.body.style.cursor;
      const previousBodyUserSelect = document.body.style.userSelect;
      const previousRootCursor = document.documentElement.style.cursor;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.documentElement.style.cursor = "col-resize";

      const applyWidth = (nextWidth: number) => {
        if (!shellElement) {
          return;
        }

        shellElement.style.width = `${nextWidth}px`;
        shellElement.style.marginLeft = `${RIGHT_PANEL_GAP_PX}px`;
      };

      const cleanupDrag = (commit: boolean) => {
        const dragState = dragStateRef.current;
        dragStateRef.current = null;
        setRightPanelDragging(false);
        document.body.style.cursor = previousBodyCursor;
        document.body.style.userSelect = previousBodyUserSelect;
        document.documentElement.style.cursor = previousRootCursor;

        if (dragState) {
          dragState.handle.removeEventListener("lostpointercapture", handleLostPointerCapture);
          try {
            if (dragState.handle.hasPointerCapture(dragState.pointerId)) {
              dragState.handle.releasePointerCapture(dragState.pointerId);
            }
          } catch {
            // The handle may already have lost capture during window blur or webview handoff.
          }
        }

        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
        window.removeEventListener("mouseup", handleMouseUpFallback);
        window.removeEventListener("blur", handleWindowBlur);
        window.removeEventListener("keydown", handleKeyDown);
        dragCleanupRef.current = null;

        if (!commit || !dragState) {
          return;
        }

        const finalWidth = clampRightPanelWidth(
          dragState.currentWidth,
          dragState.containerWidth,
        );
        applyWidth(finalWidth);
        updateRightPanelState({ width: finalWidth });
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;

        const delta = dragState.startX - moveEvent.clientX;
        const nextWidth = clampRightPanelWidth(
          dragState.startWidth + delta,
          dragState.containerWidth,
        );

        dragState.currentWidth = nextWidth;
        applyWidth(nextWidth);
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState || upEvent.pointerId !== dragState.pointerId) return;
        cleanupDrag(true);
      };

      const handlePointerCancel = () => cleanupDrag(false);
      const handleMouseUpFallback = () => cleanupDrag(true);
      const handleWindowBlur = () => cleanupDrag(true);
      const handleLostPointerCapture = () => cleanupDrag(true);
      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") {
          cleanupDrag(false);
        }
      };

      event.currentTarget.addEventListener("lostpointercapture", handleLostPointerCapture);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
      window.addEventListener("mouseup", handleMouseUpFallback);
      window.addEventListener("blur", handleWindowBlur);
      window.addEventListener("keydown", handleKeyDown);
      dragCleanupRef.current = () => cleanupDrag(true);
    },
    [
      active,
      resolvedRightPanelWidth,
      rightPanelShellRef,
      setRightPanelDragging,
      threadWorkspaceRef,
      threadWorkspaceWidth,
      updateRightPanelState,
    ],
  );

  return {
    cleanupRightPanelResize,
    handleRightPanelResizePointerDown,
  };
}
