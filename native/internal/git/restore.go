package git

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type RestorePlan struct {
	Repository string `json:"repository"`
	Files      []File `json:"files"`
	Token      string `json:"token"`
}
type RestoreResult struct {
	Backup   string   `json:"backup"`
	Restored []string `json:"restored"`
	Problem  string   `json:"problem,omitempty"`
}
type restoreState struct {
	plan         RestorePlan
	head, staged string
	hashes       map[string]string
	exists       map[string]bool
	headPaths    map[string]bool
}

func restoreSnapshot(root, repo string, paths []string) (restoreState, error) {
	state := restoreState{hashes: map[string]string{}, exists: map[string]bool{}, headPaths: map[string]bool{}}
	repo, err := validateRepository(root, repo)
	if err != nil {
		return state, err
	}
	if len(paths) == 0 || len(paths) > 500 {
		return state, errors.New("请选择 1 至 500 个变更文件，较多改动请分批处理")
	}
	changed, err := files(repo)
	if err != nil {
		return state, err
	}
	byPath := map[string]File{}
	for _, file := range changed {
		byPath[file.Path] = file
	}
	state.plan.Repository = repo
	state.plan.Files = []File{}
	selected := map[string]bool{}
	for _, path := range paths {
		file, ok := byPath[path]
		if !filepath.IsLocal(path) || !ok || selected[path] {
			return state, errors.New("变更范围已改变，请刷新后再还原")
		}
		selected[path] = true
		state.plan.Files = append(state.plan.Files, file)
		if file.OldPath != "" {
			selected[file.OldPath] = true
		}
	}
	sort.Slice(state.plan.Files, func(i, j int) bool { return state.plan.Files[i].Path < state.plan.Files[j].Path })
	state.head, _ = command(repo, "rev-parse", "--verify", "HEAD")
	arguments := []string{"diff", "--binary", "--no-ext-diff", "--no-textconv", "--cached", "--"}
	all := []string{}
	for path := range selected {
		all = append(all, path)
	}
	sort.Strings(all)
	arguments = append(arguments, all...)
	state.staged, err = command(repo, arguments...)
	if err != nil {
		return state, err
	}
	directory, err := os.OpenRoot(repo)
	if err != nil {
		return state, err
	}
	defer directory.Close()
	var total int64
	for _, path := range all {
		if !filepath.IsLocal(path) {
			return state, errors.New("文件路径越出仓库")
		}
		info, err := directory.Lstat(path)
		if os.IsNotExist(err) {
			state.hashes[path] = "missing"
		} else if err != nil {
			return state, err
		} else {
			if !info.Mode().IsRegular() {
				return state, errors.New("目录、子模块或符号链接请在外部 Git 工具中还原")
			}
			total += info.Size()
			if total > 128*1024*1024 {
				return state, errors.New("待还原文件超过 128 MiB，请分批或在外部 Git 工具中处理")
			}
			file, err := directory.Open(path)
			if err != nil {
				return state, err
			}
			hash := sha256.New()
			n, err := io.Copy(hash, io.LimitReader(file, 128*1024*1024+1))
			_ = file.Close()
			if err != nil || n != info.Size() {
				return state, errors.New("文件读取期间发生变化，请重新确认")
			}
			state.hashes[path] = hex.EncodeToString(hash.Sum(nil))
			state.exists[path] = true
		}
		if strings.TrimSpace(state.head) != "" {
			entry, err := command(repo, "ls-tree", "-z", "HEAD", "--", path)
			if err != nil {
				return state, err
			}
			state.headPaths[path] = entry != ""
		}
	}
	raw, _ := json.Marshal(struct {
		Repository, Head, Staged string
		Files                    []File
		Hashes                   map[string]string
	}{repo, state.head, state.staged, state.plan.Files, state.hashes})
	state.plan.Token = storage.Hash(raw)
	return state, nil
}
func PreviewRestore(root, repo string, paths []string) (RestorePlan, error) {
	state, err := restoreSnapshot(root, repo, paths)
	return state.plan, err
}
func Restore(root, repo string, paths []string, token, backupDirectory string) (RestoreResult, error) {
	state, err := restoreSnapshot(root, repo, paths)
	if err != nil {
		return RestoreResult{}, err
	}
	if token == "" || state.plan.Token != token {
		return RestoreResult{}, errors.New("文件或暂存区在确认后发生变化，未执行还原，请重新预览")
	}
	if err = os.MkdirAll(backupDirectory, 0700); err != nil {
		return RestoreResult{}, err
	}
	backup, err := os.OpenFile(filepath.Join(backupDirectory, "restore-"+rand.Text()+".zip"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return RestoreResult{}, err
	}
	result := RestoreResult{Backup: backup.Name(), Restored: []string{}}
	archive := zip.NewWriter(backup)
	backupErr := func() error {
		manifest, _ := json.MarshalIndent(state.plan, "", "  ")
		for name, data := range map[string][]byte{"manifest.json": manifest, "staged.patch": []byte(state.staged)} {
			entry, err := archive.Create(name)
			if err != nil {
				return err
			}
			if _, err = entry.Write(data); err != nil {
				return err
			}
		}
		directory, err := os.OpenRoot(state.plan.Repository)
		if err != nil {
			return err
		}
		defer directory.Close()
		for path := range state.exists {
			file, err := directory.Open(path)
			if err != nil {
				return err
			}
			data, err := io.ReadAll(io.LimitReader(file, 128*1024*1024+1))
			_ = file.Close()
			if err != nil {
				return err
			}
			if storage.Hash(data) != state.hashes[path] {
				return errors.New("文件在备份时发生变化，未执行还原")
			}
			entry, err := archive.Create("working/" + filepath.ToSlash(path))
			if err != nil {
				return err
			}
			if _, err = io.Copy(entry, bytes.NewReader(data)); err != nil {
				return err
			}
		}
		return nil
	}()
	closeZipErr := archive.Close()
	if backupErr == nil {
		backupErr = closeZipErr
	}
	if backupErr == nil {
		backupErr = backup.Sync()
	}
	closeErr := backup.Close()
	if backupErr == nil {
		backupErr = closeErr
	}
	if backupErr != nil {
		return result, backupErr
	}
	// Recheck the whole scope after the backup, before the first destructive operation.
	current, err := restoreSnapshot(root, repo, paths)
	if err != nil {
		return result, err
	}
	if current.plan.Token != token {
		return result, errors.New("文件或暂存区在备份时发生变化，未执行还原")
	}
	tracked, added := []string{}, []string{}
	for path := range state.hashes {
		if state.headPaths[path] {
			tracked = append(tracked, path)
		} else {
			added = append(added, path)
		}
	}
	sort.Strings(tracked)
	sort.Strings(added)
	if len(tracked) > 0 {
		_, err = command(repo, append([]string{"restore", "--source=HEAD", "--staged", "--worktree", "--"}, tracked...)...)
		if err != nil {
			result.Problem = "还原中断，本地备份已保留：" + err.Error()
			return result, nil
		}
		result.Restored = append(result.Restored, tracked...)
	}
	directory, err := os.OpenRoot(state.plan.Repository)
	if err != nil {
		result.Problem = err.Error()
		return result, nil
	}
	defer directory.Close()
	for _, path := range added {
		if _, err = command(repo, "rm", "--cached", "-f", "--ignore-unmatch", "--", path); err != nil {
			result.Problem = err.Error()
			return result, nil
		}
		if state.exists[path] {
			if err = directory.Remove(path); err != nil {
				result.Problem = "已停止，未处理其余文件：" + err.Error()
				return result, nil
			}
		}
		result.Restored = append(result.Restored, path)
	}
	return result, nil
}
