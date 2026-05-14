import { create } from "zustand";
import type {
  DesktopApi,
  GitBranchSummary,
  GitDiffOverview,
} from "@shared/contracts";

type GitStoreState = {
  gitBranchSummary: GitBranchSummary | null;
  gitOverview: GitDiffOverview | null;
  gitOverviewLoading: boolean;
  branchRequest: Promise<GitBranchSummary | null> | null;
  branchRequestWorkspace: string | null;
  branchRequestSerial: number;
  overviewRequest: Promise<GitDiffOverview | null> | null;
  overviewRequestWorkspace: string | null;
  overviewRequestSerial: number;
  lastGitBranchRefreshAt: number;
  setGitOverviewLoading: (loading: boolean) => void;
  refreshGitBranchSummary: (
    desktopApi: DesktopApi | undefined,
    workspace: string | null,
  ) => Promise<GitBranchSummary | null>;
  refreshGitOverview: (
    desktopApi: DesktopApi | undefined,
    workspace: string | null,
  ) => Promise<GitDiffOverview | null>;
  resetGitStoreForTests: () => void;
};

const initialGitState = {
  gitBranchSummary: null as GitBranchSummary | null,
  gitOverview: null as GitDiffOverview | null,
  gitOverviewLoading: false,
  branchRequest: null as Promise<GitBranchSummary | null> | null,
  branchRequestWorkspace: null as string | null,
  branchRequestSerial: 0,
  overviewRequest: null as Promise<GitDiffOverview | null> | null,
  overviewRequestWorkspace: null as string | null,
  overviewRequestSerial: 0,
  lastGitBranchRefreshAt: 0,
};

export const useGitStore = create<GitStoreState>((set, get) => ({
  ...initialGitState,
  setGitOverviewLoading: (gitOverviewLoading) => set({ gitOverviewLoading }),
  refreshGitBranchSummary: async (desktopApi, workspace) => {
    if (!desktopApi?.git) {
      set({ gitBranchSummary: null });
      return null;
    }

    const state = get();
    if (state.branchRequest && state.branchRequestWorkspace === workspace) {
      return state.branchRequest;
    }

    const requestSerial = state.branchRequestSerial + 1;
    const request = desktopApi.git
      .getSummary()
      .then((summary) => {
        const latest = get();
        if (
          latest.branchRequestSerial === requestSerial &&
          latest.branchRequestWorkspace === workspace
        ) {
          set({ gitBranchSummary: summary });
        }
        return summary;
      })
      .finally(() => {
        if (get().branchRequest === request) {
          set({ branchRequest: null, branchRequestWorkspace: null });
        }
      });

    set({
      branchRequest: request,
      branchRequestWorkspace: workspace,
      branchRequestSerial: requestSerial,
      lastGitBranchRefreshAt: Date.now(),
    });
    return request;
  },
  refreshGitOverview: async (desktopApi, workspace) => {
    if (!desktopApi?.git) {
      set({ gitBranchSummary: null, gitOverview: null });
      return null;
    }

    const state = get();
    if (state.overviewRequest && state.overviewRequestWorkspace === workspace) {
      return state.overviewRequest;
    }

    const requestSerial = state.overviewRequestSerial + 1;
    set({ gitOverviewLoading: true });
    const request = desktopApi.git
      .getSnapshot()
      .then((overview) => {
        const latest = get();
        if (
          latest.overviewRequestSerial === requestSerial &&
          latest.overviewRequestWorkspace === workspace
        ) {
          set({ gitOverview: overview, gitBranchSummary: overview.branch });
        }
        return overview;
      })
      .finally(() => {
        if (get().overviewRequest === request) {
          set({
            overviewRequest: null,
            overviewRequestWorkspace: null,
            gitOverviewLoading: false,
          });
        }
      });

    set({
      overviewRequest: request,
      overviewRequestWorkspace: workspace,
      overviewRequestSerial: requestSerial,
    });
    return request;
  },
  resetGitStoreForTests: () => set({ ...initialGitState }),
}));
