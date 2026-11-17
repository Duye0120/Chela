// chat-dev serves the Vite development process over private stdio. Desktop uses Electron IPC through the Go stdio service.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/Duye0120/Chela/native/internal/chat"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type request struct {
	ID     int
	Method string
	Args   []json.RawMessage
}

func dispatch(c *chat.Chat, r request) (any, error) {
	a := make([]string, len(r.Args))
	for i, raw := range r.Args {
		if r.Method == "Pin" || r.Method == "Archive" || r.Method == "ResolveApproval" {
			if i == 1 {
				continue
			}
		}
		if err := json.Unmarshal(raw, &a[i]); err != nil {
			return nil, err
		}
	}
	switch r.Method {
	case "MCPServers":
		return c.MCPServers()
	case "SaveMCP":
		if len(a) == 1 {
			return nil, c.SaveMCP(a[0])
		}
	case "ChangeMCP":
		if len(a) == 2 {
			return nil, c.ChangeMCP(a[0], a[1])
		}
	case "Capabilities":
		return c.Capabilities()
	case "InstallCapability":
		if len(a) == 1 {
			return c.InstallCapability(a[0])
		}
	case "ChangeCapability":
		if len(a) == 2 {
			return nil, c.ChangeCapability(a[0], a[1])
		}
	case "ExtensionUI":
		if len(a) == 1 {
			return c.ExtensionUI(a[0])
		}
	case "ResolveExtensionUI":
		if len(a) == 1 {
			return nil, c.ResolveExtensionUI(a[0])
		}
	case "Snapshot":
		return c.Snapshot()
	case "Create":
		return c.Create()
	case "Configure":
		if len(a) == 3 {
			return nil, c.Configure(a[0], a[1], a[2])
		}
	case "MagpieStatus":
		return c.MagpieStatus()
	case "ConnectMagpie":
		if len(a) == 2 {
			return c.ConnectMagpie(a[0], a[1])
		}
	case "RefreshMagpie":
		return c.RefreshMagpie()
	case "ModelRoles":
		return c.ModelRoles()
	case "CustomModel":
		return c.CustomModel()
	case "ExtractDocument":
		if len(a) == 2 {
			return c.ExtractDocument(a[0], a[1])
		}
	case "RuntimeSettings":
		if len(a) == 1 {
			return c.RuntimeSettings(a[0])
		}
	case "SetRuntimeSettings":
		if len(a) == 2 {
			return nil, c.SetRuntimeSettings(a[0], a[1])
		}
	case "SelectProject":
		if len(a) == 2 {
			return c.SelectProject(a[0], a[1])
		}
	case "References":
		if len(a) == 2 {
			return c.References(context.Background(), a[0], a[1])
		}
	case "ReferenceContent":
		if len(a) == 2 {
			return c.ReferenceContent(a[0], a[1])
		}
	case "GlobalRules":
		return c.GlobalRules()
	case "NetworkSettings":
		return c.NetworkSettings()
	case "SetNetworkSettings":
		if len(a) == 1 {
			return nil, c.SetNetworkSettings(a[0])
		}
	case "TestNetwork":
		return c.TestNetwork()
	case "Providers":
		return c.Providers()
	case "SetProviderEnabled":
		if len(a) == 2 {
			return nil, c.SetProviderEnabled(a[0], a[1])
		}
	case "TestProvider":
		if len(a) == 1 {
			return c.TestProvider(a[0])
		}
	case "AppInformation":
		return c.AppInformation(), nil
	case "Diagnostics":
		return c.Diagnostics()
	case "CheckUpdates":
		return c.CheckUpdates()
	case "SaveGlobalRules":
		if len(a) == 2 {
			return c.SaveGlobalRules(a[0], a[1])
		}
	case "Companion":
		return c.Companion()
	case "SetProjectQuiet":
		if len(a) == 1 {
			return nil, c.SetProjectQuiet(a[0])
		}
	case "SaveCompanionSettings":
		if len(a) == 1 {
			return c.SaveCompanionSettings(a[0])
		}
	case "SavePersona":
		if len(a) == 1 {
			return nil, c.SavePersona(a[0])
		}
	case "SaveAttention":
		if len(a) == 1 {
			return c.SaveAttention(a[0])
		}
	case "ChangeAttention":
		if len(a) == 1 {
			return nil, c.ChangeAttention(a[0])
		}
	case "Memories":
		if len(a) == 2 {
			return c.Memories(a[0], a[1])
		}
	case "MemoryJobs":
		if len(a) == 1 {
			return c.MemoryJobs(a[0])
		}
	case "MemoryIndexStatus":
		return c.MemoryIndexStatus()
	case "LegacyMemories":
		return c.LegacyMemories()
	case "ClassifyLegacyMemory":
		if len(a) == 1 {
			return nil, c.ClassifyLegacyMemory(a[0])
		}
	case "ConsolidateMemories":
		if len(a) == 1 {
			return c.ConsolidateMemories(a[0])
		}
	case "SaveMemory":
		if len(a) == 1 {
			return c.SaveMemory(a[0])
		}
	case "ForgetMemory":
		if len(a) == 3 {
			return nil, c.ForgetMemory(a[0], a[1], a[2])
		}
	case "SetModelRole":
		if len(a) == 2 {
			return nil, c.SetModelRole(a[0], a[1])
		}
	case "Send":
		if len(a) == 4 {
			return c.Send(context.Background(), a[0], a[1], a[2], a[3])
		}
	case "Submit":
		if len(a) == 5 {
			return c.Submit(a[0], a[1], a[2], a[3], a[4])
		}
	case "SubmitContext":
		if len(a) == 5 {
			return c.SubmitContext(a[0], a[1], a[2], a[3], a[4])
		}
	case "Attachment":
		if len(a) == 3 {
			return c.Attachment(a[0], a[1], a[2])
		}
	case "ConfigureModel":
		if len(a) == 1 {
			return nil, c.ConfigureModel(a[0])
		}
	case "GitRepositories":
		if len(a) == 2 {
			return c.GitRepositories(a[0], a[1])
		}
	case "GitDiff":
		if len(a) == 3 {
			return c.GitDiff(a[0], a[1], a[2])
		}
	case "GitRestorePreview":
		if len(a) == 3 {
			return c.GitRestorePreview(a[0], a[1], a[2])
		}
	case "GitRestore":
		if len(a) == 4 {
			return c.GitRestore(a[0], a[1], a[2], a[3])
		}
	case "DefaultDirectory":
		return c.DefaultDirectory()
	case "SetDefaultDirectory":
		if len(a) == 1 {
			return nil, c.SetDefaultDirectory(a[0])
		}
	case "AllowSessionApproval":
		if len(a) == 1 {
			return nil, c.AllowSessionApproval(a[0])
		}
	case "Steer":
		if len(a) == 3 {
			return c.Steer(a[0], a[1], a[2])
		}
	case "EditMessage":
		if len(a) == 6 {
			return c.EditMessage(a[0], a[1], a[2], a[3], a[4], a[5])
		}
	case "Compact":
		if len(a) == 2 {
			return c.Compact(a[0], a[1])
		}
	case "Recover":
		if len(a) == 2 {
			return c.Recover(a[0], a[1])
		}
	case "Branches":
		if len(a) == 1 {
			return c.Branches(a[0])
		}
	case "SwitchBranch":
		if len(a) == 2 {
			return c.SwitchBranch(a[0], a[1])
		}
	case "Observe":
		if len(a) == 1 {
			return c.Observe(a[0])
		}
	case "Cancel":
		if len(a) == 1 {
			return nil, c.Cancel(a[0])
		}
	case "ResolveApproval":
		if len(a) == 2 {
			var approved bool
			if err := json.Unmarshal(r.Args[1], &approved); err != nil {
				return nil, err
			}
			return nil, c.ResolveApproval(a[0], approved)
		}
	case "Progress":
		if len(a) == 1 {
			return c.Progress(a[0]), nil
		}
	case "Stop":
		if len(a) == 1 {
			return nil, c.Stop(a[0])
		}
	case "Group":
		if len(a) == 2 {
			return c.Group(a[0], a[1])
		}
	case "Rename":
		if len(a) == 2 {
			return c.Rename(a[0], a[1])
		}
	case "Delete":
		if len(a) == 1 {
			return nil, c.Delete(a[0])
		}
	case "Pin", "Archive":
		if len(a) == 2 {
			var b bool
			if err := json.Unmarshal(r.Args[1], &b); err != nil {
				return nil, err
			}
			if r.Method == "Pin" {
				return c.Pin(a[0], b)
			}
			return c.Archive(a[0], b)
		}
	}
	return nil, errors.New("无效的 Chat 请求")
}
func dispatchWork(w *work.Work, r request) (any, error) {
	switch r.Method {
	case "Work.Plans":
		return w.Plans()
	case "Work.UpdatePlan":
		if len(r.Args) == 1 {
			var p work.PlanDraft
			if err := json.Unmarshal(r.Args[0], &p); err != nil {
				return nil, err
			}
			return w.UpdatePlan(p)
		}
	case "Work.CommitPlan", "Work.DiscardPlan":
		if len(r.Args) == 2 {
			var id string
			var revision int64
			if err := json.Unmarshal(r.Args[0], &id); err != nil {
				return nil, err
			}
			if err := json.Unmarshal(r.Args[1], &revision); err != nil {
				return nil, err
			}
			if r.Method == "Work.CommitPlan" {
				return nil, w.CommitPlan(id, revision)
			}
			return nil, w.DiscardPlan(id, revision)
		}
	case "Work.Notifications":
		return w.Notifications()
	case "Work.Reminders":
		if len(r.Args) == 1 {
			var item string
			if err := json.Unmarshal(r.Args[0], &item); err != nil {
				return nil, err
			}
			return w.Reminders(item)
		}
	case "Work.SaveReminder":
		if len(r.Args) == 1 {
			var rule work.Reminder
			if err := json.Unmarshal(r.Args[0], &rule); err != nil {
				return nil, err
			}
			return w.SaveReminder(rule)
		}
	case "Work.RespondNotification":
		if len(r.Args) == 3 {
			var args [3]string
			for i := range args {
				if err := json.Unmarshal(r.Args[i], &args[i]); err != nil {
					return nil, err
				}
			}
			return nil, w.RespondNotification(args[0], args[1], args[2])
		}
	case "Work.Tasks":
		return w.Tasks()
	case "Work.WindowCloseMode":
		return w.WindowCloseMode()
	case "Work.SetWindowCloseMode", "Work.Details":
		if len(r.Args) == 1 {
			var value string
			if err := json.Unmarshal(r.Args[0], &value); err != nil {
				return nil, err
			}
			if r.Method == "Work.Details" {
				return w.Details(value)
			}
			return nil, w.SetWindowCloseMode(value)
		}
	case "Work.Notes":
		return w.Notes()
	case "Work.SaveTask":
		if len(r.Args) == 1 {
			var t work.WorkTask
			if err := json.Unmarshal(r.Args[0], &t); err != nil {
				return nil, err
			}
			return w.SaveTask(t)
		}
	case "Work.SaveNote":
		if len(r.Args) == 1 {
			var n work.WorkNote
			if err := json.Unmarshal(r.Args[0], &n); err != nil {
				return nil, err
			}
			return w.SaveNote(n)
		}
	case "Work.DeleteTask", "Work.DeleteNote":
		if len(r.Args) == 1 {
			var id string
			if err := json.Unmarshal(r.Args[0], &id); err != nil {
				return nil, err
			}
			if r.Method == "Work.DeleteTask" {
				return nil, w.DeleteTask(id)
			}
			return nil, w.DeleteNote(id)
		}
	}
	return nil, errors.New("无效的 Work 请求")
}
func main() {
	dir := os.Getenv("CHELA_SHELL_PROFILE")
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			panic(err)
		}
		dir = filepath.Join(base, "Chela", "web-dev")
	}
	store := storage.New(dir)
	c, closeChat := chat.New(dir, store)
	w := work.New(dir, store)
	defer closeChat()
	if err := c.Start(); err != nil {
		json.NewEncoder(os.Stderr).Encode(map[string]string{"error": err.Error()})
		return
	}
	in := json.NewDecoder(os.Stdin)
	out := json.NewEncoder(os.Stdout)
	var mu sync.Mutex
	for {
		var r request
		if err := in.Decode(&r); err != nil {
			if err != io.EOF {
				closeChat()
				os.Exit(1)
			}
			return
		}
		go func() {
			var v any
			var e error
			if strings.HasPrefix(r.Method, "Work.") {
				v, e = dispatchWork(w, r)
			} else {
				v, e = dispatch(c, r)
			}
			msg := ""
			if e != nil {
				msg = e.Error()
			}
			mu.Lock()
			defer mu.Unlock()
			out.Encode(map[string]any{"id": r.ID, "value": v, "error": msg})
		}()
	}
}
