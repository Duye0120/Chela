package maintenance

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"

	"github.com/Duye0120/Chela/native/internal/chat"
	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

type MigrationReport struct {
	SourceFiles          int              `json:"sourceFiles"`
	Before               map[string]int64 `json:"before"`
	After                map[string]int64 `json:"after"`
	RepeatedImportStable bool             `json:"repeatedImportStable"`
	Activated            bool             `json:"activated"`
	SQLiteVersion        string           `json:"sqliteVersion"`
	SQLiteSource         string           `json:"sqliteSource"`
}

// Preview migrates a verified copy twice and never opens a worker or edits the source profile.
func Preview(source, destination string) (MigrationReport, error) {
	var report MigrationReport
	destination, stage, err := newDestination(source, destination)
	if err != nil {
		return report, err
	}
	defer os.RemoveAll(stage)
	m, err := Backup(source, filepath.Join(stage, "source"))
	if err != nil {
		return report, err
	}
	profile := filepath.Join(stage, "profile")
	if err = os.Mkdir(profile, 0700); err != nil {
		return report, err
	}
	if err = copyManifest(filepath.Join(stage, "source"), profile, m); err != nil {
		return report, err
	}
	report.SourceFiles, report.Before = len(m.Files), m.Counts
	store := storage.New(profile)
	defer store.Close()
	importAll := func() error {
		if err := chat.ImportProfile(profile, store); err != nil {
			return err
		}
		if _, err := work.New(profile, store).Tasks(); err != nil {
			return err
		}
		if err := companion.ImportProfile(store, profile); err != nil {
			return err
		}
		return memory.ImportLegacy(store, profile)
	}
	if err = importAll(); err != nil {
		return report, err
	}
	var once, twice Manifest
	if err = databaseFacts(profile, &once); err != nil {
		return report, err
	}
	if err = importAll(); err != nil {
		return report, err
	}
	if err = databaseFacts(profile, &twice); err != nil {
		return report, err
	}
	report.After, report.SQLiteVersion, report.SQLiteSource = twice.Counts, twice.SQLiteVersion, twice.SQLiteSource
	report.RepeatedImportStable = reflect.DeepEqual(once.Counts, twice.Counts)
	if !report.RepeatedImportStable {
		return report, errors.New("重复导入改变了正式数据数量，已停止切换")
	}
	if err = store.Close(); err != nil {
		return report, err
	}
	raw, _ := json.MarshalIndent(report, "", "  ")
	if err = os.WriteFile(filepath.Join(stage, "migration-report.json"), raw, 0600); err != nil {
		return report, err
	}
	return report, os.Rename(stage, destination)
}
