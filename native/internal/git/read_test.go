package git

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRealRepositoriesAndDiffBoundaries(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "project one")
	other := filepath.Join(root, "second")
	for _, dir := range []string{repo, other} {
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
		if _, err := command(dir, "init", "--quiet", "--template="); err != nil {
			t.Fatal(err)
		}
	}
	write := func(path, text string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(repo, "file.txt"), "original\n")
	if _, err := command(repo, "add", "file.txt"); err != nil {
		t.Fatal(err)
	}
	if _, err := command(repo, "-c", "user.name=Chela Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "-c", "core.hooksPath="+t.TempDir(), "commit", "--quiet", "-m", "fixture"); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(repo, "file.txt"), "hello again\n")
	write(filepath.Join(repo, ".gitattributes"), "*.txt filter=attack\n")
	if _, err := command(repo, "config", "filter.attack.clean", "echo FILTER_EXECUTED"); err != nil {
		t.Fatal(err)
	}
	if _, err := command(repo, "config", "filter.attack.required", "true"); err != nil {
		t.Fatal(err)
	}
	if items, err := List(root, 0); err != nil || len(items) != 0 {
		t.Fatal(items, err)
	}
	items, err := List(root, 1)
	if err != nil || len(items) != 2 {
		t.Fatal(items, err)
	}
	patch, err := Diff(root, repo, "file.txt")
	if err != nil || !strings.Contains(patch.Text, "+hello again") || strings.Contains(patch.Text, "FILTER_EXECUTED") {
		t.Fatal(patch, err)
	}
	write(filepath.Join(other, "new.txt"), "staged\n")
	if _, err := command(other, "add", "new.txt"); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(other, "new.txt"), "working\n")
	patch, err = Diff(root, other, "new.txt")
	if err != nil || !strings.Contains(patch.Text, "+working\n") || strings.Contains(patch.Text, "+staged") {
		t.Fatal(patch, err)
	}
	outside := t.TempDir()
	if _, err = Diff(root, outside, "file.txt"); err == nil {
		t.Fatal("outside repository accepted")
	}
	if _, err = Diff(root, repo, "../second/new.txt"); err == nil {
		t.Fatal("path traversal accepted")
	}
	write(filepath.Join(repo, "binary.dat"), "\x00\x01")
	plan, err := PreviewRestore(root, repo, []string{"file.txt"})
	if err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(repo, "file.txt"), "later edit\n")
	if _, err = Restore(root, repo, []string{"file.txt"}, plan.Token, t.TempDir()); err == nil {
		t.Fatal("stale restore discarded new edits")
	}
	plan, err = PreviewRestore(root, repo, []string{"file.txt"})
	if err != nil {
		t.Fatal(err)
	}
	result, err := Restore(root, repo, []string{"file.txt"}, plan.Token, t.TempDir())
	if err != nil || result.Problem != "" {
		t.Fatal(result, err)
	}
	data, err := os.ReadFile(filepath.Join(repo, "file.txt"))
	if err != nil || strings.ReplaceAll(string(data), "\r\n", "\n") != "original\n" {
		t.Fatal("tracked file not restored", string(data), err)
	}
	data, err = os.ReadFile(filepath.Join(other, "new.txt"))
	if err != nil || string(data) != "working\n" {
		t.Fatal("other repository changed", string(data), err)
	}
	backup, err := zip.OpenReader(result.Backup)
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	found := false
	for _, file := range backup.File {
		if file.Name == "working/file.txt" {
			reader, e := file.Open()
			if e != nil {
				t.Fatal(e)
			}
			data, e := io.ReadAll(reader)
			_ = reader.Close()
			if e != nil || string(data) != "later edit\n" {
				t.Fatal("backup omitted working change", e)
			}
			found = true
		}
	}
	if !found {
		t.Fatal("missing restore backup")
	}
	plan, err = PreviewRestore(root, other, []string{"new.txt"})
	if err != nil {
		t.Fatal(err)
	}
	result, err = Restore(root, other, []string{"new.txt"}, plan.Token, t.TempDir())
	if err != nil || result.Problem != "" {
		t.Fatal(result, err)
	}
	if _, err = os.Stat(filepath.Join(other, "new.txt")); !os.IsNotExist(err) {
		t.Fatal("unborn staged file not removed", err)
	}
	patch, err = Diff(root, repo, "binary.dat")
	if err != nil || !patch.Binary {
		t.Fatal(patch, err)
	}
}
