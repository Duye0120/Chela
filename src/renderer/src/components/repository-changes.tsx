import { useState } from "react";
import type { GitDiffOverview } from "@shared/contracts";
import { Button } from "@renderer/components/ui/button";

export function RepositoryChanges({ directory }: { directory: string }) {
  const [overview, setOverview] = useState<GitDiffOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function readChanges() {
    setLoading(true);
    setError("");
    try {
      setOverview(await window.desktopApi.git.getSnapshotForDirectory(directory));
    } catch (reason) {
      setOverview(null);
      setError(`读取仓库改动失败：${String(reason)}`);
    } finally {
      setLoading(false);
    }
  }

  return <details className="text-xs text-muted-foreground">
    <summary className="w-fit cursor-pointer">仓库改动</summary>
    <div className="space-y-2 py-2">
      <p className="break-all">{directory}</p>
      <p>包含当前仓库的所有改动，可能来自多个任务。</p>
      <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => void readChanges()}>
        {loading ? "正在读取…" : overview ? "刷新仓库改动" : "查看仓库改动"}
      </Button>
      {error && <p role="alert">{error}</p>}
      {overview && (overview.isGitRepo ? (
        overview.sources.all.totalFiles === 0 ? <p>仓库没有未提交的改动。</p> : (
          <ul className="space-y-1">
            {overview.sources.all.files.map((file) => (
              <li key={file.path} className="break-all">
                <details>
                  <summary className="cursor-pointer">{file.path} <span className="whitespace-nowrap">+{file.additions} / −{file.deletions}</span></summary>
                  {file.patch ? <pre className="max-h-80 overflow-auto py-2">{file.patch}</pre> : <p>没有文本差异可预览。</p>}
                </details>
              </li>
            ))}
          </ul>
        )
      ) : <p>该目录未检测到 Git 仓库。</p>)}
    </div>
  </details>;
}
