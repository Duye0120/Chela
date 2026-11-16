package capabilities

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func TestRegistryCopiesScopeDependenciesAndIntegrity(t *testing.T) {
	profile, source := t.TempDir(), t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	r := Registry{store, profile}
	write := func(name, text string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(source, name), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("package.json", `{"name":"demo","version":"1.0.0","pi":{"extensions":["index.ts"]}}`)
	write("index.ts", "export default () => {}")
	m, err := r.Install(source, "")
	if err != nil {
		t.Fatal(err)
	}
	if m.Enabled || m.Trust != "trusted-native" {
		t.Fatal(m)
	}
	if _, err = r.Install(source, ""); err == nil {
		t.Fatal("duplicate id accepted")
	}
	if err = r.Change(m.ID, "enable"); err != nil {
		t.Fatal(err)
	}
	write("index.ts", "source changed")
	if got, err := r.Snapshot(""); err != nil || len(got) != 1 {
		t.Fatal("mutable source affected install", got, err)
	}
	write("package.json", `{"name":"dependent","version":"1","pi":{"extensions":["index.ts"]},"chela":{"requires":["demo"]}}`)
	dep, err := r.Install(source, "")
	if err != nil {
		t.Fatal(err)
	}
	if err = r.Change(dep.ID, "enable"); err != nil {
		t.Fatal(err)
	}
	if err = r.Change(m.ID, "disable"); err == nil {
		t.Fatal("disabled a dependency")
	}
	if err = os.WriteFile(filepath.Join(m.Root, "index.ts"), []byte("tampered"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = r.Change(m.ID, "reload"); err == nil {
		t.Fatal("tampered package accepted")
	}
	if err = validateGraph([]Manifest{{ID: "a", Requires: []string{"b"}}, {ID: "b", Requires: []string{"a"}}}, false); err == nil {
		t.Fatal("cycle accepted")
	}
	if err = validateGraph([]Manifest{{ID: "a", Requires: []string{"missing"}}}, false); err == nil {
		t.Fatal("missing dependency accepted")
	}
	write("package.json", `{"name":"escape","version":"1","pi":{"extensions":["../outside.ts"]}}`)
	if _, err = r.Install(source, ""); err == nil {
		t.Fatal("path escape accepted")
	}
}

func TestResourceScopeAndUnsupportedLevels(t *testing.T) {
	profile, project, source := t.TempDir(), t.TempDir(), t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	r := Registry{store, profile}
	if err := os.WriteFile(filepath.Join(source, "SKILL.md"), []byte("---\nname: fixture\ndescription: fixture\n---\nOnly this project."), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "package.json"), []byte(`{"name":"resource","version":"1","pi":{"skills":["SKILL.md"]}}`), 0600); err != nil {
		t.Fatal(err)
	}
	m, err := r.Install(source, project)
	if err != nil || m.Compatibility != "A" || m.Trust != "managed" {
		t.Fatal(m, err)
	}
	if err = r.Change(m.ID, "enable"); err != nil {
		t.Fatal(err)
	}
	if items, err := r.Snapshot(""); err != nil || len(items) != 0 {
		t.Fatal("project resource leaked", items, err)
	}
	if items, err := r.Snapshot(project); err != nil || len(items) != 1 {
		t.Fatal(items, err)
	}
	for _, level := range []string{"D", "E"} {
		text := `{"name":"unsupported` + level + `","version":"1","pi":{"skills":["SKILL.md"]},"chela":{"id":"unsupported` + strings.ToLower(level) + `","compatibility":"` + level + `"}}`
		if err = os.WriteFile(filepath.Join(source, "package.json"), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
		m, err = r.Install(source, "")
		if err != nil {
			t.Fatal(err)
		}
		if err = r.Change(m.ID, "enable"); err == nil {
			t.Fatal("unsupported level enabled", level)
		}
	}
}
