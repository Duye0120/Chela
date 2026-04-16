import { useState, type FC } from "react";
import type {
  InterruptedApprovalGroup,
  InterruptedApprovalNotice,
  PendingApprovalGroup,
  PendingApprovalNotice,
} from "@shared/contracts";
import { Button } from "@renderer/components/assistant-ui/button";

type PendingApprovalNoticeBarProps = {
  groups: PendingApprovalGroup[];
  onResolve: (approval: PendingApprovalNotice, allowed: boolean) => Promise<void>;
};

type InterruptedApprovalNoticeBarProps = {
  groups: InterruptedApprovalGroup[];
  onDismiss: (runId: string) => void | Promise<void>;
  onUseRecoveryPrompt: (approval: InterruptedApprovalNotice) => void;
  onResume: (approval: InterruptedApprovalNotice) => Promise<void>;
};

const interruptedApprovalKindLabels: Record<
  InterruptedApprovalNotice["approval"]["kind"],
  string
> = {
  shell: "Shell",
  file_write: "文件写入",
  mcp: "MCP",
};

function formatApprovalTime(timestamp: number | null): string {
  if (!timestamp) {
    return "未知时间";
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRunKind(
  runKind: InterruptedApprovalNotice["runKind"],
): string {
  if (!runKind) {
    return "未知 run";
  }

  return runKind;
}

function formatShortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

const ApprovalDetailCard: FC<{
  reason: string;
  detail?: string;
  metaItems: string[];
}> = ({ reason, detail, metaItems }) => {
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-[12px] leading-5 text-[color:var(--color-text-secondary)]/85 outline-none transition-colors hover:text-[color:var(--color-text-primary)]">
        查看审批上下文
      </summary>
      <div className="mt-2 space-y-2 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-2.5 py-2">
        <p className="text-[12px] leading-5">触发原因：{reason}</p>
        {detail ? (
          <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-2 py-1.5 text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
            {detail}
          </pre>
        ) : null}
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-4 text-[color:var(--color-text-secondary)]/80">
          {metaItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </details>
  );
};

export const PendingApprovalNoticeBar: FC<PendingApprovalNoticeBarProps> = ({
  groups,
  onResolve,
}) => {
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {groups.map((group) => {
        const latestApproval = group.approvals[0];
        if (!latestApproval) {
          return null;
        }

        const requestId = latestApproval.approval.requestId;
        const isResolving = resolvingRequestId === requestId;

        return (
          <div
            key={`${group.sessionId}:${group.ownerId}:${requestId}`}
            className="flex items-center gap-1 rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-1.5 py-1"
          >
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isResolving}
              className="shadow-none"
              onClick={() => {
                setResolvingRequestId(requestId);
                void onResolve(latestApproval, true).finally(() => {
                  setResolvingRequestId((current) =>
                    current === requestId ? null : current,
                  );
                });
              }}
            >
              允许
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isResolving}
              onClick={() => {
                setResolvingRequestId(requestId);
                void onResolve(latestApproval, false).finally(() => {
                  setResolvingRequestId((current) =>
                    current === requestId ? null : current,
                  );
                });
              }}
            >
              拒绝
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export const InterruptedApprovalNoticeBar: FC<InterruptedApprovalNoticeBarProps> = ({
  groups,
  onDismiss,
  onUseRecoveryPrompt,
  onResume,
}) => {
  const [resumingRunId, setResumingRunId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 px-1">
      {groups.map((group) => {
        const latestApproval = group.approvals[0];
        if (!latestApproval) {
          return null;
        }

        const isResuming = resumingRunId === latestApproval.runId;
        const metaItems = [
          `run ${formatShortId(latestApproval.runId)}`,
          formatRunKind(latestApproval.runKind),
          `模型 ${latestApproval.modelEntryId ? formatShortId(latestApproval.modelEntryId) : "未知"}`,
          `中断 ${formatApprovalTime(latestApproval.interruptedAt)}`,
        ];

        return (
          <div
            key={`${group.sessionId}:${group.ownerId}:${latestApproval.runId}`}
            className="flex items-start justify-between gap-3 rounded-[var(--radius-shell)] bg-[color:var(--color-control-panel-bg)] px-3 py-2.5 text-[13px] text-[color:var(--color-text-secondary)] shadow-[var(--color-control-shadow)]"
          >
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-full bg-[color:var(--color-control-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-text-secondary)]">
                    {interruptedApprovalKindLabels[latestApproval.approval.kind]}
                  </span>
                  <p className="font-medium text-[color:var(--color-text-primary)]">
                    待确认操作在应用重启时中断
                  </p>
                </div>
                <p className="line-clamp-2 leading-5">
                  {latestApproval.approval.title}：{latestApproval.approval.description}
                </p>
                <p className="text-[12px] leading-5 text-[color:var(--color-text-secondary)]/85">
                  原 run 已标记为中断，当前保留决策上下文。{group.count > 1 ? `同组记录 ${group.count} 条。` : ""}
                </p>
              </div>
              <ApprovalDetailCard
                reason={latestApproval.approval.reason}
                detail={latestApproval.approval.detail}
                metaItems={metaItems}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {latestApproval.canResume ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isResuming}
                  onClick={() => {
                    setResumingRunId(latestApproval.runId);
                    void onResume(latestApproval)
                      .catch(() => undefined)
                      .finally(() => {
                        setResumingRunId((current) =>
                          current === latestApproval.runId ? null : current,
                        );
                      });
                  }}
                >
                  恢复执行
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isResuming}
                onClick={() => {
                  onUseRecoveryPrompt(latestApproval);
                }}
              >
                填入输入框
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isResuming}
                onClick={() => {
                  void onDismiss(latestApproval.runId);
                }}
              >
                知道了
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
