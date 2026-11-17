import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitGitChanges, getDiffForFiles, getGitDiffSnapshot, pushGitChanges } from "../src/main/git.ts";

function withTempDir(test: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chela-git-"));
  return Promise.resolve(test(dir)).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

await withTempDir(async (dir) => {
  const repoDir = path.join(dir, "repo");
  const remoteDir = path.join(dir, "remote.git");
  fs.mkdirSync(repoDir, { recursive: true });

  git(["init", "--bare", remoteDir], dir);
  git(["init"], repoDir);
  git(["config", "user.name", "Chela Test"], repoDir);
  git(["config", "user.email", "chela@example.test"], repoDir);
  git(["switch", "-c", "feature/push-upstream"], repoDir);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Chela\n");
  git(["add", "README.md"], repoDir);
  git(["commit", "-m", "test: seed repo"], repoDir);
  git(["remote", "add", "origin", remoteDir], repoDir);

  await pushGitChanges(repoDir);

  const upstream = git(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    repoDir,
  ).trim();
  const remoteHead = git(
    ["--git-dir", remoteDir, "rev-parse", "refs/heads/feature/push-upstream"],
    dir,
  ).trim();

  assert.equal(upstream, "origin/feature/push-upstream");
  assert.equal(remoteHead.length, 40);

  await pushGitChanges(repoDir);
});

await withTempDir(async (dir) => {
  const repoDir = path.join(dir, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  git(["init"], repoDir);
  git(["config", "user.name", "Chela Test"], repoDir);
  git(["config", "user.email", "chela@example.test"], repoDir);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Chela\n");
  git(["add", "README.md"], repoDir);
  git(["commit", "-m", "test: seed repo"], repoDir);

  const largeFileName = "large-untracked.txt";
  fs.writeFileSync(path.join(repoDir, largeFileName), "x".repeat(1024 * 1024 + 1));

  const diff = await getDiffForFiles(repoDir, [largeFileName]);

  assert.match(diff, /diff --git a\/large-untracked\.txt b\/large-untracked\.txt/);
  assert.match(diff, /File is too large to display/);
  assert.doesNotMatch(diff, /xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/);
});

await withTempDir(async (dir) => {
  const repoDir = path.join(dir, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  git(["init"], repoDir);
  git(["config", "user.name", "Chela Test"], repoDir);
  git(["config", "user.email", "chela@example.test"], repoDir);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Chela\n");
  git(["add", "README.md"], repoDir);
  git(["commit", "-m", "test: seed repo"], repoDir);

  for (let index = 0; index < 96; index += 1) {
    fs.writeFileSync(path.join(repoDir, `untracked-${index}.txt`), `new file ${index}\n`);
  }

  const overview = await getGitDiffSnapshot(repoDir);
  const allFiles = overview.sources.all.files;
  const fullPatchFiles = allFiles.filter((file) => file.patch.includes("@@"));
  const deferredFiles = allFiles.filter((file) => file.patch.includes("Diff preview deferred"));

  assert.equal(overview.sources.all.totalFiles, 96);
  assert.equal(allFiles.length, 96);
  assert.ok(
    fullPatchFiles.length < allFiles.length,
    "Git diff snapshots should avoid materializing every patch in large dirty trees.",
  );
  assert.ok(
    deferredFiles.length > 0,
    "Git diff snapshots should keep file rows while deferring excess patch previews.",
  );
});

await withTempDir(async (dir) => {
  const repoDir = path.join(dir, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  git(["init"], repoDir);
  git(["config", "user.name", "Chela Test"], repoDir);
  git(["config", "user.email", "chela@example.test"], repoDir);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Chela\n");
  git(["add", "README.md"], repoDir);
  git(["commit", "-m", "test: seed repo"], repoDir);

  fs.writeFileSync(path.join(repoDir, "README.md"), "# Chela\nupdated\n");

  await commitGitChanges(repoDir, "docs: update readme", ["README.md"]);

  assert.equal(git(["log", "-1", "--pretty=%s"], repoDir).trim(), "docs: update readme");
  assert.equal(git(["status", "--porcelain=v1"], repoDir).trim(), "");
});

await withTempDir(async (dir) => {
  const repoDir = path.join(dir, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  git(["init"], repoDir);
  git(["config", "user.name", "Chela Test"], repoDir);
  git(["config", "user.email", "chela@example.test"], repoDir);
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Chela\n");
  git(["add", "README.md"], repoDir);
  git(["commit", "-m", "test: seed repo"], repoDir);

  await assert.rejects(
    () => commitGitChanges(repoDir, "docs: empty selected file", ["README.md"]),
    (error) =>
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "GIT_COMMIT_EMPTY" &&
      String((error as { message?: unknown }).message).includes("选中的文件没有可提交内容"),
  );
});

console.log("git regression tests passed");
