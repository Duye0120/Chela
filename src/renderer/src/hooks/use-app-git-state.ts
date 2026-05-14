import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import type {
  DesktopApi,
  Settings,
} from "@shared/contracts";
import { useGitStore } from "@renderer/stores/git-store";

type AppView = "thread" | "settings";

export function useAppGitState({
  desktopApi,
  settingsRef,
  mainView,
  diffPanelOpen,
}: {
  desktopApi: DesktopApi | undefined;
  settingsRef: { current: Settings | null };
  mainView: AppView;
  diffPanelOpen: boolean;
}) {
  const {
    gitBranchSummary,
    gitOverview,
    gitOverviewLoading,
    lastGitBranchRefreshAt,
    refreshGitBranchSummary: refreshGitBranchSummaryInStore,
    refreshGitOverview: refreshGitOverviewInStore,
  } = useGitStore(useShallow((state) => ({
    gitBranchSummary: state.gitBranchSummary,
    gitOverview: state.gitOverview,
    gitOverviewLoading: state.gitOverviewLoading,
    lastGitBranchRefreshAt: state.lastGitBranchRefreshAt,
    refreshGitBranchSummary: state.refreshGitBranchSummary,
    refreshGitOverview: state.refreshGitOverview,
  })));
  const diffPanelAutoRefreshArmedRef = useRef(false);

  const getWorkspace = useCallback(
    () => settingsRef.current?.workspace ?? null,
    [settingsRef],
  );

  const refreshGitBranchSummary = useCallback(async () => {
    return refreshGitBranchSummaryInStore(desktopApi, getWorkspace());
  }, [desktopApi, getWorkspace, refreshGitBranchSummaryInStore]);

  const refreshGitOverview = useCallback(async () => {
    return refreshGitOverviewInStore(desktopApi, getWorkspace());
  }, [desktopApi, getWorkspace, refreshGitOverviewInStore]);

  useEffect(() => {
    if (mainView !== "thread" || diffPanelOpen) {
      return;
    }

    if (Date.now() - lastGitBranchRefreshAt < 1_500) {
      return;
    }

    void refreshGitBranchSummary();
  }, [
    diffPanelOpen,
    lastGitBranchRefreshAt,
    mainView,
    refreshGitBranchSummary,
  ]);

  useEffect(() => {
    if (mainView !== "thread" || !diffPanelOpen) {
      diffPanelAutoRefreshArmedRef.current = false;
      return;
    }

    if (diffPanelAutoRefreshArmedRef.current) {
      return;
    }

    diffPanelAutoRefreshArmedRef.current = true;
    void refreshGitOverview();
  }, [diffPanelOpen, mainView, refreshGitOverview]);

  return {
    gitBranchSummary,
    gitOverview,
    gitOverviewLoading,
    refreshGitBranchSummary,
    refreshGitOverview,
  };
}
