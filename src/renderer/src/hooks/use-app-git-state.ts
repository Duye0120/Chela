import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DesktopApi,
  GitBranchSummary,
  GitDiffOverview,
  Settings,
} from "@shared/contracts";

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
  const [gitBranchSummary, setGitBranchSummary] =
    useState<GitBranchSummary | null>(null);
  const [gitOverview, setGitOverview] = useState<GitDiffOverview | null>(null);
  const [gitOverviewLoading, setGitOverviewLoading] = useState(false);
  const lastGitBranchRefreshRef = useRef(0);
  const gitBranchRequestRef = useRef<Promise<GitBranchSummary | null> | null>(null);
  const gitBranchRequestWorkspaceRef = useRef<string | null>(null);
  const gitBranchRequestSerialRef = useRef(0);
  const gitOverviewRequestRef = useRef<Promise<GitDiffOverview | null> | null>(null);
  const gitOverviewRequestWorkspaceRef = useRef<string | null>(null);
  const gitOverviewRequestSerialRef = useRef(0);
  const diffPanelAutoRefreshArmedRef = useRef(false);

  const refreshGitBranchSummary = useCallback(async () => {
    if (!desktopApi?.git) {
      setGitBranchSummary(null);
      return null;
    }

    const workspace = settingsRef.current?.workspace ?? null;

    if (
      gitBranchRequestRef.current &&
      gitBranchRequestWorkspaceRef.current === workspace
    ) {
      return gitBranchRequestRef.current;
    }

    lastGitBranchRefreshRef.current = Date.now();
    gitBranchRequestWorkspaceRef.current = workspace;
    const requestSerial = ++gitBranchRequestSerialRef.current;
    const request = desktopApi.git
      .getSummary()
      .then((nextSummary) => {
        if (
          gitBranchRequestSerialRef.current === requestSerial &&
          settingsRef.current?.workspace === workspace
        ) {
          setGitBranchSummary(nextSummary);
        }
        return nextSummary;
      })
      .finally(() => {
        if (gitBranchRequestRef.current === request) {
          gitBranchRequestRef.current = null;
          gitBranchRequestWorkspaceRef.current = null;
        }
      });

    gitBranchRequestRef.current = request;
    return request;
  }, [desktopApi, settingsRef]);

  const refreshGitOverview = useCallback(async () => {
    if (!desktopApi?.git) {
      setGitBranchSummary(null);
      setGitOverview(null);
      return null;
    }

    const workspace = settingsRef.current?.workspace ?? null;

    if (
      gitOverviewRequestRef.current &&
      gitOverviewRequestWorkspaceRef.current === workspace
    ) {
      return gitOverviewRequestRef.current;
    }

    setGitOverviewLoading(true);
    gitOverviewRequestWorkspaceRef.current = workspace;
    const requestSerial = ++gitOverviewRequestSerialRef.current;

    const request = desktopApi.git
      .getSnapshot()
      .then((nextOverview) => {
        if (
          gitOverviewRequestSerialRef.current === requestSerial &&
          settingsRef.current?.workspace === workspace
        ) {
          setGitOverview(nextOverview);
          setGitBranchSummary(nextOverview.branch);
        }
        return nextOverview;
      })
      .finally(() => {
        if (gitOverviewRequestRef.current === request) {
          gitOverviewRequestRef.current = null;
          gitOverviewRequestWorkspaceRef.current = null;
        }
        setGitOverviewLoading(false);
      });

    gitOverviewRequestRef.current = request;
    return request;
  }, [desktopApi, settingsRef]);

  useEffect(() => {
    if (mainView !== "thread" || diffPanelOpen) {
      return;
    }

    if (Date.now() - lastGitBranchRefreshRef.current < 1_500) {
      return;
    }

    void refreshGitBranchSummary();
  }, [diffPanelOpen, mainView, refreshGitBranchSummary]);

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
