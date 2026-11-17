package chat

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

func TestRuntimeSettingsRulesPriorityAndReferences(t *testing.T) {
	var requests atomic.Int32
	outside := filepath.Join(t.TempDir(), "outside.txt")
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":[{"id":"fixture"}]}`))
			return
		}
		data, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(data, &body)
		if body["service_tier"] != "priority" || !bytes.Contains(data, []byte("global-proof")) || !bytes.Contains(data, []byte("project-proof")) {
			t.Error("runtime settings did not reach model request")
		}
		n := requests.Add(1)
		if n == 1 || n == 3 {
			path := "proof.txt"
			if n == 3 {
				path = outside
			}
			args, _ := json.Marshal(map[string]string{"path": path, "content": "safe proof"})
			sse(w, map[string]any{"role": "assistant", "tool_calls": []map[string]any{{"index": 0, "id": fmt.Sprintf("write-%d", n), "type": "function", "function": map[string]string{"name": "write_file", "arguments": string(args)}}}}, "tool_calls")
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "完成"}, "stop")
	})
	var err error
	s, err = c.update(s.ID, func(s *ChatSession) { s.Project = t.TempDir() })
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(s.Project, "AGENTS.md"), []byte("project-proof"), 0600); err != nil {
		t.Fatal(err)
	}
	rules, err := c.GlobalRules()
	if err != nil {
		t.Fatal(err)
	}
	rules, err = c.SaveGlobalRules("global-proof", rules.Hash)
	if err != nil {
		t.Fatal(err)
	}
	var configured profileModel
	if err = readOptional(filepath.Join(c.profile, "chat-provider.json"), &configured); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{"url": configured.URL, "model": configured.Model, "keepKey": true, "fast": true})
	if err = c.ConfigureModel(string(raw)); err != nil {
		t.Fatal(err)
	}
	preferences := RuntimeSettings{Permission: "auto", ProjectRules: true, MemoryEnabled: true, FastMode: true}
	raw, _ = json.Marshal(preferences)
	if err = c.SetRuntimeSettings(s.ID, string(raw)); err != nil {
		t.Fatal(err)
	}
	receipt, err := c.Submit(s.ID, "write proof", "chela-custom", "off", "policy-auto")
	if err != nil {
		t.Fatal(err)
	}
	run := waitRun(t, c, receipt.RunID)
	if run.State != "succeeded" {
		t.Fatal(run.State, run.Reason)
	}
	data, err := os.ReadFile(filepath.Join(s.Project, "proof.txt"))
	if err != nil || string(data) != "safe proof" {
		t.Fatal(string(data), err)
	}
	db, _ := c.store.DB()
	var count int
	if err = db.QueryRow("SELECT count(*) FROM approvals WHERE invocation_id IN (SELECT invocation_id FROM tool_invocations WHERE run_id=?)", run.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("automatic workspace mode asked approval", count, err)
	}
	preferences.Permission = "full"
	raw, _ = json.Marshal(preferences)
	if err = c.SetRuntimeSettings(s.ID, string(raw)); err != nil {
		t.Fatal(err)
	}
	receipt, err = c.Submit(s.ID, "write isolated outside proof", "chela-custom", "off", "policy-full")
	if err != nil {
		t.Fatal(err)
	}
	run = waitRun(t, c, receipt.RunID)
	if run.State != "succeeded" {
		t.Fatal(run.State, run.Reason)
	}
	data, err = os.ReadFile(outside)
	if err != nil || string(data) != "safe proof" {
		t.Fatal("full mode did not reach isolated external file", err)
	}
	if _, err = c.ReferenceContent(s.ID, "../outside.txt"); err == nil {
		t.Fatal("reference escaped project")
	}
	refs, err := c.References(context.Background(), s.ID, "proof")
	if err != nil || len(refs) != 1 {
		t.Fatal(refs, err)
	}
	global := RuntimeSettings{Permission: "ask", ProjectRules: false, MemoryEnabled: false}
	raw, _ = json.Marshal(global)
	if err = c.SetRuntimeSettings("", string(raw)); err != nil {
		t.Fatal(err)
	}
	effective, err := c.RuntimeSettings(s.ID)
	if err != nil || effective.Permission != "full" || effective.MemoryEnabled || effective.ProjectRules {
		t.Fatal("session override hid global settings", effective, err)
	}
	if _, err = c.SaveGlobalRules("new-proof", "stale-hash"); err == nil {
		t.Fatal("overwrote external rule edits")
	}
	var frozen string
	if err = db.QueryRow("SELECT context_settings_json FROM run_parameters WHERE run_id=?", run.ID).Scan(&frozen); err != nil || !strings.Contains(frozen, "global-proof") {
		t.Fatal("rule snapshot not persisted", err)
	}
	var document bytes.Buffer
	archive := zip.NewWriter(&document)
	entry, _ := archive.Create("word/document.xml")
	_, _ = entry.Write([]byte("<document><p><t>DOCX proof</t></p></document>"))
	_ = archive.Close()
	text, err := c.ExtractDocument("sample.docx", base64.StdEncoding.EncodeToString(document.Bytes()))
	if err != nil || text != "DOCX proof" {
		t.Fatal(text, err)
	}
	if _, err = c.TestProvider("chela-custom"); err != nil {
		t.Fatal("provider directory probe", err)
	}
	if err = c.SetProviderEnabled("chela-custom", "false"); err != nil {
		t.Fatal(err)
	}
	models, _, chosen, _, err := c.catalog()
	if err != nil || len(models) != 0 || chosen != "" {
		t.Fatal("disabled provider still selectable", models, chosen, err)
	}
	if err = c.SetProviderEnabled("chela-custom", "true"); err != nil {
		t.Fatal(err)
	}
	report, err := c.Diagnostics()
	if err != nil || report["databaseHealthy"] != true {
		t.Fatal("health report", report, err)
	}
	encoded, _ := json.Marshal(report)
	if strings.Contains(string(encoded), "global-proof") || strings.Contains(string(encoded), "fixture-key") {
		t.Fatal("diagnostics included private content")
	}
}

func TestPiExtensionUIAndLifecycle(t *testing.T) {
	var calls atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		if calls.Add(1) == 1 {
			if !strings.Contains(string(data), "fixture__echo") {
				t.Error("extension tool not in actual model request")
			}
			sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "extension-1", "type": "function", "function": map[string]any{"name": "fixture__echo", "arguments": `{"value":"hello"}`}}}}, "tool_calls")
			return
		}
		if !strings.Contains(string(data), "selected:first") {
			t.Error("UI result not in model request", string(data))
		}
		if !strings.Contains(string(data), "fixture contents") {
			t.Error("nested managed read did not return its result")
		}
		sse(w, map[string]any{"role": "assistant", "content": "扩展已完成"}, "stop")
	})
	source := t.TempDir()
	_ = os.WriteFile(filepath.Join(source, "package.json"), []byte(`{"name":"fixture","version":"1","pi":{"extensions":["index.ts"]},"chela":{"compatibility":"C","permissions":["local Node access"]}}`), 0600)
	_ = os.WriteFile(filepath.Join(source, "index.ts"), []byte(`import { Type } from '@sinclair/typebox';
export default function(pi){
 console.log('extension log must not contaminate protocol');
 pi.on('session_start',()=>pi.appendEntry('fixture-start',{ok:true}));
 pi.on('session_shutdown',()=>pi.appendEntry('fixture-stop',{ok:true}));
 pi.registerCommand('fixture__ping',{description:'ping',handler:async(_args,ctx)=>ctx.ui.notify('pong')});
 pi.registerTool({name:'fixture__echo',label:'Echo',description:'fixture',parameters:Type.Object({value:Type.String()}),execute:async(id,args,signal,update,ctx)=>{
  const value=await ctx.ui.select('Pick one',['first','second']);
  const nested=await ctx.executeTool('read_file',{path:'fixture.txt'});
  return {content:[{type:'text',text:'selected:'+value+' '+JSON.stringify(nested)}],details:{}};
 }});
}`), 0600)
	input, _ := json.Marshal(map[string]string{"source": source})
	m, err := c.InstallCapability(string(input))
	if err != nil {
		t.Fatal(err)
	}
	// No worker has run yet; registry enable preserves the fixture's explicitly supplied worker.
	if err = c.capabilityRegistry().Change(m.ID, "enable"); err != nil {
		t.Fatal(err)
	}
	r, err := c.Submit(s.ID, "try extension", "chela-custom", "off", "extension-test")
	if err != nil {
		t.Fatal(err)
	}
	var pending []ExtensionUIRequest
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		pending, err = c.ExtensionUI(s.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(pending) > 0 {
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	if len(pending) != 1 {
		run := waitRun(t, c, r.RunID)
		t.Fatal("no extension request", run.State, run.Reason)
	}
	if err = c.ChangeCapability(m.ID, "disable"); err == nil {
		t.Fatal("hot disable accepted")
	}
	answer := func(session, value string) error {
		raw, _ := json.Marshal(map[string]any{"id": pending[0].ID, "session": session, "run": r.RunID, "answer": value})
		return c.ResolveExtensionUI(string(raw))
	}
	if err = answer("other-session", "first"); err == nil {
		t.Fatal("cross session UI answer accepted")
	}
	if err = answer(s.ID, "invalid"); err == nil {
		t.Fatal("invalid choice accepted")
	}
	if err = answer(s.ID, "first"); err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.State, run.Reason)
	}
	db, _ := c.store.DB()
	var entries int
	if err = db.QueryRow("SELECT count(*) FROM pi_entries WHERE session_id=? AND json_extract(payload_json,'$.customType') IN ('fixture-start','fixture-stop')", s.ID).Scan(&entries); err != nil || entries != 2 {
		t.Fatal("extension entries lost", entries, err)
	}
	if err = answer(s.ID, "first"); err == nil {
		t.Fatal("late UI answer accepted")
	}
	if calls.Load() != 2 {
		t.Fatal("unexpected requests", calls.Load())
	}
	var nested int
	if err = db.QueryRow("SELECT count(*) FROM tool_invocations WHERE run_id=? AND parent_invocation_id IS NOT NULL AND tool_id='read_file' AND state='succeeded'", r.RunID).Scan(&nested); err != nil || nested != 1 {
		t.Fatal("nested managed receipt missing", nested, err)
	}
}

func TestPiResourcesAndFailedExtensionIsolation(t *testing.T) {
	var modelCalls atomic.Int32
	var skillFile, outsideFile string
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		call := modelCalls.Add(1)
		data, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(data), "RESOURCE_PROMPT_SENTINEL") || !strings.Contains(string(data), "resource__fixture-skill") {
			t.Error("resources missing from actual request", string(data))
		}
		if call <= 2 {
			path := skillFile
			if call == 2 {
				path = outsideFile
			}
			args, _ := json.Marshal(map[string]string{"path": path})
			sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": fmt.Sprint("skill-", call), "type": "function", "function": map[string]string{"name": "read", "arguments": string(args)}}}}, "tool_calls")
			return
		}
		if !strings.Contains(string(data), "Fixture skill body.") || !strings.Contains(string(data), "只能读取本轮已安装 skill") {
			t.Error("managed skill contents or scope denial missing")
		}
		sse(w, map[string]any{"role": "assistant", "content": "resources loaded"}, "stop")
	})
	c.runtimeDir, _ = filepath.Abs("../../bin/runtime")
	outsideFile = filepath.Join(s.Project, "fixture.txt")
	install := func(name, manifest string, files map[string]string) {
		t.Helper()
		source := t.TempDir()
		files["package.json"] = manifest
		for path, body := range files {
			target := filepath.Join(source, path)
			if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(target, []byte(body), 0600); err != nil {
				t.Fatal(err)
			}
		}
		raw, _ := json.Marshal(map[string]string{"source": source})
		m, err := c.InstallCapability(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		if m.ID != name {
			t.Fatal(m)
		}
		if name == "resource" {
			skillFile = filepath.Join(m.Root, "skill", "SKILL.md")
		}
		if err = c.capabilityRegistry().Change(m.ID, "enable"); err != nil {
			t.Fatal(err)
		}
	}
	install("resource", `{"name":"resource","version":"1","pi":{"skills":["skill/SKILL.md"],"prompts":["hello.md"]}}`, map[string]string{"skill/SKILL.md": "---\nname: fixture-skill\ndescription: Local fixture skill\n---\nFixture skill body.", "hello.md": "RESOURCE_PROMPT_SENTINEL"})
	install("broken", `{"name":"broken","version":"1","pi":{"extensions":["index.ts"]}}`, map[string]string{"index.ts": "export default function(){throw new Error('fixture extension load failure')}"})
	r, err := c.Submit(s.ID, "/resource__hello", "chela-custom", "off", "resource-test")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "failed" || modelCalls.Load() != 0 {
		t.Fatal(run.State, run.Reason)
	}
	items, err := c.Capabilities()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.ID == "broken" && item.Health != "failed" {
			t.Fatal("failed package not isolated", item)
		}
	}
	snapshot, err := c.capabilityRegistry().Snapshot(s.Project)
	if err != nil || len(snapshot) != 1 || snapshot[0].ID != "resource" {
		t.Fatal(snapshot, err)
	}
	<-c.pool[s.ID].done
	worker, err := startPiWorker(c.runtimeDir)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool[s.ID] = worker
	c.mu.Unlock()
	r, err = c.Submit(s.ID, "/resource__hello", "chela-custom", "off", "resource-retry")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.State, run.Reason)
	}
}

func TestMCPDiscoveryApprovalAndDurableReceipt(t *testing.T) {
	var executions, initializations, modelCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var request struct {
			ID     json.RawMessage
			Method string
			Params json.RawMessage
		}
		if json.NewDecoder(r.Body).Decode(&request) != nil {
			w.WriteHeader(400)
			return
		}
		if len(request.ID) == 0 {
			w.WriteHeader(202)
			return
		}
		var result any
		switch request.Method {
		case "initialize":
			initializations.Add(1)
			result = map[string]any{"protocolVersion": "2025-11-25", "serverInfo": map[string]string{"name": "fixture", "version": "1"}, "capabilities": map[string]any{"tools": map[string]any{}}}
		case "tools/list":
			result = map[string]any{"tools": []any{map[string]any{"name": "echo", "description": "Echo the provided text", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"text": map[string]string{"type": "string"}}, "required": []string{"text"}, "additionalProperties": false}}}}
		case "tools/call":
			executions.Add(1)
			result = map[string]any{"content": []map[string]string{{"type": "text", "text": "MCP-durable-result"}}}
		default:
			t.Errorf("unexpected MCP method %s", request.Method)
			w.WriteHeader(400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": request.ID, "result": result})
	}))
	defer server.Close()
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		var body struct {
			Tools []struct {
				Function struct {
					Name       string
					Parameters json.RawMessage
				}
			}
		}
		_ = json.Unmarshal(data, &body)
		call := modelCalls.Add(1)
		name, args := "tool_search", `{"query":"echo"}`
		if call == 1 {
			for _, tool := range body.Tools {
				if tool.Function.Name == "mcp__fixture__echo" {
					t.Error("deferred tool declared before discovery")
				}
			}
		}
		if call == 2 {
			name, args = "mcp__fixture__echo", `{"text":"hello"}`
			found := false
			for _, tool := range body.Tools {
				if tool.Function.Name == name && strings.Contains(string(tool.Function.Parameters), "text") {
					found = true
				}
			}
			if !found {
				t.Error("discovery omitted full schema", string(data))
			}
		}
		if call > 2 {
			if !strings.Contains(string(data), "MCP-durable-result") {
				t.Error("result missing")
			}
			sse(w, map[string]any{"role": "assistant", "content": "done"}, "stop")
			return
		}
		sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": fmt.Sprint("mcp-", call), "type": "function", "function": map[string]string{"name": name, "arguments": args}}}}, "tool_calls")
	})
	c.runtimeDir, _ = filepath.Abs("../../bin/runtime")
	raw, _ := json.Marshal(MCPConfig{ID: "fixture", URL: server.URL, Headers: map[string]string{"X-Fixture-Key": "fixture-only-secret"}})
	if err := c.SaveMCP(string(raw)); err != nil {
		t.Fatal(err)
	}
	if err := c.ChangeMCP("fixture", "enable"); err != nil {
		t.Fatal(err)
	}
	statuses, err := c.MCPServers()
	if err != nil || len(statuses) != 1 || len(statuses[0].Config.Headers) != 0 {
		t.Fatal("secrets exposed", statuses, err)
	}
	r, err := c.Submit(s.ID, "use echo", "chela-custom", "off", "mcp-test")
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(12 * time.Second)
	var approvals []Approval
	for time.Now().Before(deadline) {
		approvals, _ = c.Approvals()
		if len(approvals) > 0 {
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	if len(approvals) != 1 {
		run := waitRun(t, c, r.RunID)
		t.Fatal("missing MCP approval", run.State, run.Reason)
	}
	if executions.Load() != 0 {
		t.Fatal("MCP executed before approval")
	}
	if !strings.Contains(approvals[0].Preview, "hello") {
		t.Fatal("final args not shown", approvals[0])
	}
	if err = c.ResolveApproval(approvals[0].ID, true); err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.State, run.Reason)
	}
	if executions.Load() != 1 || initializations.Load() != 1 {
		t.Fatal("duplicate MCP owner or effect", executions.Load(), initializations.Load())
	}
	db, _ := c.store.DB()
	var state, receipt string
	if err = db.QueryRow("SELECT state,result_json FROM tool_invocations WHERE run_id=? AND tool_id='mcp__fixture__echo'", r.RunID).Scan(&state, &receipt); err != nil || state != "succeeded" || !strings.Contains(receipt, "MCP-durable-result") {
		t.Fatal(state, receipt, err)
	}
	if err = c.ChangeMCP("fixture", "disable"); err != nil {
		t.Fatal(err)
	}
	if len(c.mcpClients) != 0 {
		t.Fatal("connection not disposed")
	}
}

func TestMCPStdioResourcesAndKnownRecovery(t *testing.T) {
	c, s := fixtureChat(t, func(http.ResponseWriter, *http.Request) { t.Error("provider should not run") })
	c.started = true
	c.runtimeDir, _ = filepath.Abs("../../bin/runtime")
	fixture := filepath.Join(t.TempDir(), "server.cjs")
	const source = `const readline=require('node:readline');let calls=0;
readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;
switch(r.method){
case 'initialize':result={protocolVersion:'2025-11-25',serverInfo:{name:'stdio-fixture',version:'1'},capabilities:{tools:{},resources:{}}};break;
case 'tools/list':result={tools:[{name:'echo',description:'echo',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}]};break;
case 'tools/call':result={content:[{type:'text',text:'execution:'+ ++calls}]};break;
case 'resources/list':result={resources:[{uri:'fixture://one',name:'One'}]};break;
case 'resources/templates/list':result={resourceTemplates:[{uriTemplate:'fixture://{id}',name:'Fixture'}]};break;
case 'resources/read':result={contents:[{uri:r.params.uri,text:'fixture-resource'}]};break;
default:throw Error(r.method)}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\n')});`
	if err := os.WriteFile(fixture, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(MCPConfig{ID: "stdio", Command: filepath.Join(c.runtimeDir, "node.exe"), Args: []string{fixture}, AutoApprove: true})
	if err := c.SaveMCP(string(raw)); err != nil {
		t.Fatal(err)
	}
	if err := c.ChangeMCP("stdio", "enable"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Submit(s.ID, "fixture", "chela-custom", "off", "stdio-1"); err != nil {
		t.Fatal(err)
	}
	claim := func() Run {
		t.Helper()
		run, err := c.claimRun()
		if err != nil {
			t.Fatal(err)
		}
		if _, err = c.openPi(run, c.pool[s.ID]); err != nil {
			t.Fatal(err)
		}
		if tools, err := c.freezeMCP(context.Background(), run); err != nil || len(tools) != 4 {
			t.Fatal("catalog", tools, err)
		}
		return run
	}
	call := func(run Run, id, name, args string) (any, error) {
		t.Helper()
		err := c.store.Update(context.Background(), func(tx *sql.Tx) error {
			_, err := tx.Exec(`INSERT INTO tool_invocations(invocation_id,run_id,attempt_id,pi_tool_call_id,tool_id,tool_version,final_args_json,final_args_hash,resource_versions_json,effect_class,state,idempotency_key,created_at) VALUES(?,?,?,?,?,'1',?,?,'{}','external_write','planned',?,?)`, run.ID+id, run.ID, run.AttemptID, id, name, args, storage.Hash([]byte(args)), run.ID+id, storage.Now())
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
		return c.executeMCPTool(context.Background(), run, toolRequest{ID: id, Name: name, Args: json.RawMessage(args)})
	}
	run := claim()
	for _, x := range []struct{ name, args, want string }{{"chela_resources", "{}", "fixture://one"}, {"chela_templates", "{}", "fixture://{id}"}, {"chela_read", `{"uri":"fixture://one"}`, "fixture-resource"}, {"echo", `{"text":"one"}`, "execution:1"}} {
		result, err := call(run, x.name, "mcp__stdio__"+x.name, x.args)
		data, _ := json.Marshal(result)
		if err != nil || !strings.Contains(string(data), x.want) {
			t.Fatal(x.name, string(data), err)
		}
	}
	if _, err := call(run, "invalid", "mcp__stdio__echo", `{}`); err == nil {
		t.Fatal("invalid final arguments accepted")
	}
	if err := c.settleRun(run, "interrupted", "fixture crash after receipts"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Recover(run.ID, "stdio-recover"); err != nil {
		t.Fatal(err)
	}
	recovered := claim()
	result, err := call(recovered, "echo-again", "mcp__stdio__echo", `{"text":"one"}`)
	data, _ := json.Marshal(result)
	if err != nil || !strings.Contains(string(data), "execution:1") {
		t.Fatal("known result replayed", string(data), err)
	}
	result, err = call(recovered, "different", "mcp__stdio__echo", `{"text":"two"}`)
	data, _ = json.Marshal(result)
	if err != nil || !strings.Contains(string(data), "execution:2") {
		t.Fatal("execution count", string(data), err)
	}
	if err = c.settleRun(recovered, "cancelled", "fixture complete"); err != nil {
		t.Fatal(err)
	}
}

func TestExtensionUICancellationAndTimeout(t *testing.T) {
	c, s := fixtureChat(t, func(http.ResponseWriter, *http.Request) { t.Error("provider should not run") })
	c.started = true
	if _, err := c.Submit(s.ID, "fixture", "chela-custom", "off", "ui-timeout"); err != nil {
		t.Fatal(err)
	}
	run, err := c.claimRun()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.openPi(run, c.pool[s.ID]); err != nil {
		t.Fatal(err)
	}
	if _, err = c.requestExtensionUI(context.Background(), run, json.RawMessage(`{"kind":"input","key":"timeout","timeout":20}`)); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := c.requestExtensionUI(ctx, run, json.RawMessage(`{"kind":"confirm","key":"cancelled"}`))
		done <- err
	}()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		items, _ := c.ExtensionUI(s.ID)
		if len(items) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	if err = <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	db, _ := c.store.DB()
	var count int
	if err = db.QueryRow("SELECT count(*) FROM extension_ui_requests WHERE state='expired'").Scan(&count); err != nil || count != 2 {
		t.Fatal(count, err)
	}
	if err = c.ResolveExtensionUI(fmt.Sprintf(`{"id":"timeout","session":%q,"run":%q,"answer":"late"}`, s.ID, run.ID)); err == nil {
		t.Fatal("expired UI answer accepted")
	}
	if err = c.settleRun(run, "cancelled", "fixture complete"); err != nil {
		t.Fatal(err)
	}
}

func TestManagedAffectSnapshotAcrossSessions(t *testing.T) {
	var calls atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		text := ""
		for _, m := range request.Messages {
			if m.Role == "system" {
				var body string
				_ = json.Unmarshal(m.Content, &body)
				text += body
			}
		}
		call := calls.Add(1)
		if call == 1 {
			matches := regexp.MustCompile(`"message_id":"([^"]+)"`).FindStringSubmatch(text)
			if len(matches) != 2 {
				t.Error("source missing")
				return
			}
			args, _ := json.Marshal(map[string]any{"message_id": matches[1], "semantic_label": "friendly_teasing", "intensity": .8, "confidence": .9, "evidence": "你刚才表现不错，有点得意了吧"})
			sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "appraisal", "type": "function", "function": map[string]any{"name": "appraise_interaction", "arguments": string(args)}}}}, "tool_calls")
			return
		}
		if call == 2 && !strings.Contains(text, `"revision":0`) {
			t.Error("run snapshot changed mid-run", text)
		}
		if call == 3 {
			if !strings.Contains(text, "刚刚的轻松互动") || !strings.Contains(text, `"revision":1`) {
				t.Error("affect not carried", text)
			}
			if strings.Contains(text, "PRIVATE-A-TEXT") {
				t.Error("source text leaked to second session")
			}
		}
		sse(w, map[string]any{"role": "assistant", "content": "继续处理你的工作。"}, "stop")
	})
	r, err := c.Submit(s.ID, "你刚才表现不错，有点得意了吧 PRIVATE-A-TEXT", "chela-custom", "off", "affect-first")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	other, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	runtimeDir, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtimeDir)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool[other.ID] = worker
	c.mu.Unlock()
	r, err = c.Submit(other.ID, "解释一个严肃工作问题", "chela-custom", "off", "affect-second")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	if calls.Load() != 3 {
		t.Fatal("unexpected provider calls", calls.Load())
	}
}

func TestManagedAttentionRetainsUserSource(t *testing.T) {
	var calls atomic.Int32
	var item atomic.Value
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		if calls.Add(1) == 1 {
			text := ""
			for _, m := range request.Messages {
				if m.Role == "system" {
					var body string
					_ = json.Unmarshal(m.Content, &body)
					text += body
				}
			}
			match := regexp.MustCompile(`"message_id":"([^"]+)"`).FindStringSubmatch(text)
			if len(match) != 2 {
				t.Error("missing source")
				return
			}
			args, _ := json.Marshal(map[string]any{"message_id": match[1], "goal": "任务开始时提醒我", "condition": map[string]any{"kind": "task_status", "itemId": item.Load(), "status": "doing"}})
			sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "attention", "type": "function", "function": map[string]any{"name": "attention_save", "arguments": string(args)}}}}, "tool_calls")
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "已加入关注。"}, "stop")
	})
	task, err := work.New(c.profile, c.store).SaveTask(work.WorkTask{Title: "来源测试"})
	if err != nil {
		t.Fatal(err)
	}
	item.Store(task.ID)
	receipt, err := c.Submit(s.ID, "任务开始时提醒我", "chela-custom", "off", "attention-source")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	db, _ := c.store.DB()
	var id, state, refs string
	if err = db.QueryRow("SELECT attention_id,state,source_refs_json FROM attention_items").Scan(&id, &state, &refs); err != nil || (state != "active" && state != "waiting") || !strings.Contains(refs, receipt.MessageID) {
		t.Fatal("attention source", state, refs, err)
	}
	if _, err = db.Exec("UPDATE messages SET erased_at=? WHERE message_id=?", storage.Now(), receipt.MessageID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("UPDATE attention_items SET next_review_at=? WHERE attention_id=?", storage.Now(), id); err != nil {
		t.Fatal(err)
	}
	if err = companion.Tick(c.store, time.Now()); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT state FROM attention_items WHERE attention_id=?", id).Scan(&state); err != nil || state != "expired" {
		t.Fatal("erased source stayed active", state, err)
	}
}

func TestAttentionUsesPiBackgroundWithoutRepeat(t *testing.T) {
	var calls atomic.Int32
	var foreground atomic.Bool
	c, userSession := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Tools         []any `json:"tools"`
			MaxTokens     int   `json:"max_tokens"`
			MaxCompletion int   `json:"max_completion_tokens"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		if foreground.Load() {
			calls.Add(1)
			sse(w, map[string]any{"role": "assistant", "content": "前台正常回复"}, "stop")
			return
		}
		if len(request.Tools) != 0 {
			t.Error("background received tools")
		}
		if max(request.MaxTokens, request.MaxCompletion) != 512 {
			t.Error("wrong background output budget", request)
		}
		calls.Add(1)
		sse(w, map[string]any{"role": "assistant", "content": `{"notify":true,"text":"关注的事项已有新安排，可查看任务。","confidence":0.9,"relevance":0.9,"urgency":0.5,"actionability":0.8,"novelty":1,"interruption":0.1}`}, "stop")
	})
	w := work.New(c.profile, c.store)
	task, err := w.SaveTask(work.WorkTask{Title: "关注测试"})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(companion.Attention{Goal: "检查这项任务是否需要跟进", Condition: companion.Condition{Kind: "semantic_review", ItemID: task.ID}})
	a, err := c.SaveAttention(string(raw))
	if err != nil {
		t.Fatal(err)
	}
	runtimeDir, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtimeDir)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool["attention-"+a.ID] = worker
	c.mu.Unlock()
	if err = c.Start(); err != nil {
		t.Fatal(err)
	}
	db, _ := c.store.DB()
	deadline := time.Now().Add(10 * time.Second)
	runID := ""
	for time.Now().Before(deadline) {
		err = db.QueryRow("SELECT run_id FROM attention_reviews WHERE attention_id=?", a.ID).Scan(&runID)
		if err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if runID == "" {
		t.Fatal("review not queued", err)
	}
	run := waitRun(t, c, runID)
	if run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	if _, err = db.Exec("UPDATE attention_items SET next_review_at=? WHERE attention_id=?", storage.Now(), a.ID); err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	err = c.queueAttention()
	c.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	var reviews, deliveries int
	if err = db.QueryRow("SELECT count(*) FROM attention_reviews WHERE attention_id=?", a.ID).Scan(&reviews); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM deliveries WHERE purpose='attention'").Scan(&deliveries); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 || reviews != 1 || deliveries != 1 {
		t.Fatalf("repeat calls=%d reviews=%d deliveries=%d", calls.Load(), reviews, deliveries)
	}
	for i := 0; i < 3; i++ {
		_, err = db.Exec(`INSERT INTO model_requests(provider_request_id,permit_id,permit_expires_at,request_kind,attempt_id,manifest_id,requested_model,actual_model,status,started_at) SELECT ?,?,permit_expires_at,request_kind,attempt_id,manifest_id,requested_model,actual_model,'succeeded',started_at FROM model_requests LIMIT 1`, fmt.Sprintf("quota-%d", i), fmt.Sprintf("quota-permit-%d", i))
		if err != nil {
			t.Fatal(err)
		}
	}
	task.Title = "产生新事实"
	if _, err = w.SaveTask(task); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("UPDATE attention_items SET next_review_at=? WHERE attention_id=?", storage.Now(), a.ID); err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	err = c.queueAttention()
	c.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM attention_reviews").Scan(&reviews); err != nil || reviews != 1 {
		t.Fatal("quota not enforced", reviews, err)
	}
	foreground.Store(true)
	receipt, err := c.Submit(userSession.ID, "继续工作", "chela-custom", "off", "foreground-after-quota")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatal("quota blocked foreground", run.Reason)
	}
}

func TestManagedPlannerDraftAndCommit(t *testing.T) {
	var calls atomic.Int32
	var draft atomic.Value
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)
		if call == 1 || call == 3 {
			name := "planner_propose"
			var args any = map[string]any{"changes": []any{map[string]any{"title": "安排示例", "timezone": "Asia/Taipei", "estimateMinutes": 45, "blocks": []any{map[string]any{"localStart": "2026-12-01T09:00", "localEnd": "2026-12-01T09:30", "timezone": "Asia/Taipei", "estimateSource": "model"}, map[string]any{"localStart": "2026-12-02T09:00", "localEnd": "2026-12-02T09:15", "timezone": "Asia/Taipei", "estimateSource": "model"}}}}}
			if call == 3 {
				name = "planner_commit"
				p := draft.Load().(work.PlanDraft)
				args = map[string]any{"id": p.ID, "revision": p.Revision}
			}
			raw, _ := json.Marshal(args)
			sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": fmt.Sprint("planner-", call), "type": "function", "function": map[string]any{"name": name, "arguments": string(raw)}}}}, "tool_calls")
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "计划草案可在日历中查看。"}, "stop")
	})
	r, err := c.Submit(s.ID, "帮我安排这周", "chela-custom", "off", "plan-propose")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	planner := work.New(c.profile, c.store)
	plans, err := planner.Plans()
	if err != nil || len(plans) != 1 {
		t.Fatalf("draft: %v %v", plans, err)
	}
	tasks, err := planner.Tasks()
	if err != nil || len(tasks) != 0 {
		t.Fatalf("draft changed tasks: %v %v", tasks, err)
	}
	draft.Store(plans[0])
	r, err = c.Submit(s.ID, "按这个来", "chela-custom", "off", "plan-commit")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	tasks, err = planner.Tasks()
	if err != nil || len(tasks) != 1 || len(tasks[0].Blocks) != 2 || tasks[0].Date != "" || tasks[0].Status != "待办" {
		t.Fatalf("commit %v %v", tasks, err)
	}
}

func TestManagedMemoryTool(t *testing.T) {
	var calls atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		if calls.Add(1) == 1 {
			var text string
			_ = json.Unmarshal(request.Messages[0].Content, &text)
			matches := regexp.MustCompile(`"message_id":"([^"]+)"`).FindStringSubmatch(text)
			if len(matches) != 2 {
				t.Error("missing host source ID")
				return
			}
			args, _ := json.Marshal(map[string]any{"message_id": matches[1], "scope_type": "project", "subject": "project", "slot": "审批", "kind": "decision", "content": "审批使用双人复核", "expected_slot_revision": 0})
			sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "save-memory", "type": "function", "function": map[string]any{"name": "memory_save", "arguments": string(args)}}}}, "tool_calls")
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "记忆保存完成"}, "stop")
	})
	r, err := c.Submit(s.ID, "记住：审批使用双人复核", "chela-custom", "off", "memory-tool")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	items, err := c.Memories(s.ID, "审批")
	if err != nil || len(items) != 1 || items[0].Status != "active" {
		t.Fatalf("memory tool %+v %v", items, err)
	}
	db, _ := c.store.DB()
	var receipts int
	if err = db.QueryRow("SELECT count(*) FROM tool_invocations WHERE tool_id='memory_save' AND state='succeeded'").Scan(&receipts); err != nil || receipts != 1 {
		t.Fatal("memory receipt missing", err)
	}
}

func TestConsolidationPublishesWithCursor(t *testing.T) {
	var messageID atomic.Value
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Role    string `json:"role"`
				Content any    `json:"content"`
			} `json:"messages"`
			Tools []any `json:"tools"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		if strings.Contains(fmt.Sprint(request.Messages[len(request.Messages)-1].Content), "整理这些已提交来源") {
			if len(request.Tools) != 0 {
				t.Error("background has tools")
			}
			raw, _ := json.Marshal(map[string]any{"proposals": []memory.Proposal{{MessageID: messageID.Load().(string), Subject: "project", Slot: "偏好", Kind: "preference", Content: "习惯先查看部署状态"}}})
			sse(w, map[string]any{"role": "assistant", "content": string(raw)}, "stop")
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "received"}, "stop")
	})
	r, err := c.Submit(s.ID, "我通常会先查看部署状态", "chela-custom", "off", "consolidation-source")
	if err != nil {
		t.Fatal(err)
	}
	messageID.Store(r.MessageID)
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	projectID := "project-" + storage.Hash([]byte(filepath.Clean(s.Project)))
	internalID := "consolidation-" + storage.Hash([]byte("project:"+projectID))
	runtime, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool[internalID] = worker
	c.mu.Unlock()
	job, err := c.ConsolidateMemories(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	db, _ := c.store.DB()
	deadline := time.Now().Add(15 * time.Second)
	for {
		var state, reason string
		if err = db.QueryRow("SELECT state,last_error FROM consolidation_jobs WHERE job_id=?", job).Scan(&state, &reason); err != nil {
			t.Fatal(err)
		}
		if state == "succeeded" {
			break
		}
		if state == "failed" || time.Now().After(deadline) {
			t.Fatalf("job %s: %s", state, reason)
		}
		time.Sleep(30 * time.Millisecond)
	}
	items, err := c.Memories(s.ID, "部署")
	if err != nil || len(items) != 1 || items[0].Status != "candidate" {
		t.Fatal("candidate extraction", items, err)
	}
	var cursor, count int
	if err = db.QueryRow("SELECT last_eligible_seq FROM consolidation_cursors WHERE scope_type='project' AND scope_id=?", projectID).Scan(&cursor); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM consolidation_results WHERE job_id=?", job).Scan(&count); err != nil || count != 1 || cursor == 0 {
		t.Fatal("cursor/receipt not committed", cursor, count, err)
	}
	if _, err = c.ConsolidateMemories(s.ID); err == nil {
		t.Fatal("processed input was enqueued twice")
	}
}

func TestConsolidationPreemptedWithoutAdvancingCursor(t *testing.T) {
	started := make(chan struct{}, 1)
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var body any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if strings.Contains(fmt.Sprint(body), "整理这些已提交来源") {
			select {
			case started <- struct{}{}:
			default:
			}
			<-r.Context().Done()
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "foreground reply"}, "stop")
	})
	r, err := c.Submit(s.ID, "部署还有一个细节待确认", "chela-custom", "off", "preempt-source")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	project := "project-" + storage.Hash([]byte(filepath.Clean(s.Project)))
	internal := "consolidation-" + storage.Hash([]byte("project:"+project))
	runtime, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool[internal] = worker
	c.mu.Unlock()
	job, err := c.ConsolidateMemories(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(10 * time.Second):
		t.Fatal("background did not start")
	}
	db, _ := c.store.DB()
	var background string
	var fence int64
	if err = db.QueryRow("SELECT run_id,fencing_token FROM consolidation_jobs WHERE job_id=?", job).Scan(&background, &fence); err != nil {
		t.Fatal(err)
	}
	foreground, err := c.Submit(s.ID, "立即继续当前工作", "chela-custom", "off", "foreground-preempt")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, background); run.State != "cancelled" {
		t.Fatal("background did not yield", run.State, run.Reason)
	}
	if run := waitRun(t, c, foreground.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	var cursor int
	if err = db.QueryRow("SELECT last_eligible_seq FROM consolidation_cursors WHERE scope_type='project' AND scope_id=?", project).Scan(&cursor); err != nil || cursor != 0 {
		t.Fatal("preempted cursor advanced", cursor, err)
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error { return memory.CommitJob(tx, job, background, fence, `{"proposals":[]}`) })
	if err == nil || !strings.Contains(err.Error(), "STALE_CONSOLIDATION") {
		t.Fatal("late worker accepted", err)
	}
}

func TestMemoryScopeCorrectionAndForget(t *testing.T) {
	var lastPacket atomic.Value
	c, a := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var packet any
		if err := json.NewDecoder(r.Body).Decode(&packet); err != nil {
			t.Error(err)
			return
		}
		raw, _ := json.Marshal(packet)
		lastPacket.Store(string(raw))
		sse(w, map[string]any{"role": "assistant", "content": "memory checked"}, "stop")
	})
	save := func(p memory.Proposal) memory.Item {
		t.Helper()
		raw, _ := json.Marshal(p)
		i, err := c.SaveMemory(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		return i
	}
	p := memory.Proposal{CommandID: "remember-name", SessionID: a.ID, ScopeType: "assistant", Subject: "user", Slot: "称呼", Kind: "preference", Content: "以后叫我老大"}
	global := save(p)
	again := save(p)
	if global.ID != again.ID || again.Revision != 1 {
		t.Fatal("duplicate command created memory")
	}
	project := save(memory.Proposal{CommandID: "remember-project", SessionID: a.ID, ScopeType: "project", Subject: "project", Slot: "部署", Kind: "decision", Content: "审批部署到私密区域七号"})
	b, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	items, err := c.Memories(a.ID, "审批")
	if err != nil || len(items) != 1 || items[0].ID != project.ID {
		t.Fatalf("Chinese search: %+v %v", items, err)
	}
	items, err = c.Memories(b.ID, "审批")
	if err != nil || len(items) != 0 {
		t.Fatalf("cross-project leak: %+v %v", items, err)
	}
	runtime, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	c.pool[b.ID] = worker
	receipt, err := c.Submit(b.ID, "你记得什么", "chela-custom", "off", "memory-b")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	packet := lastPacket.Load().(string)
	if !strings.Contains(packet, "以后叫我老大") || strings.Contains(packet, "私密区域七号") {
		t.Fatalf("incorrect actual model context: %s", packet)
	}
	p.ID = global.ID
	p.CommandID = "correct-name"
	p.Content = "以后叫我同学"
	p.ExpectedRevision = 1
	p.ExpectedSlotRevision = global.SlotRevision
	corrected := save(p)
	if corrected.Revision != 2 {
		t.Fatal("correction lost version")
	}
	p.CommandID = "stale-correction"
	raw, _ := json.Marshal(p)
	if _, err = c.SaveMemory(string(raw)); err == nil || !strings.Contains(err.Error(), "MEMORY_CONFLICT") {
		t.Fatal("stale correction accepted", err)
	}
	if err = c.ForgetMemory(b.ID, corrected.ID, "2"); err != nil {
		t.Fatal(err)
	}
	items, err = c.Memories(b.ID, "")
	if err != nil || len(items) != 0 {
		t.Fatal("forgotten memory remains visible", items, err)
	}
	db, _ := c.store.DB()
	var payloads int
	if err = db.QueryRow("SELECT count(*) FROM memory_revisions WHERE memory_id=? AND content IS NOT NULL", global.ID).Scan(&payloads); err != nil || payloads != 0 {
		t.Fatal("forgotten payload retained", err)
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := memory.Publish(tx, memory.Proposal{CommandID: "resurrect", SessionID: a.ID, MessageID: "memory-user-remember-name", ScopeType: "assistant", Subject: "user", Slot: "称呼", Kind: "preference", Content: "以后叫我老大", ExpectedSlotRevision: 3}, false)
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "屏蔽") {
		t.Fatal("erased source resurrected", err)
	}
	if _, err = db.Exec("INSERT INTO memory_fts(memory_fts, rank) VALUES('integrity-check',1)"); err != nil {
		t.Fatal(err)
	}
}

func TestConservativeContextBudgetStopsBeforeNetwork(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		sse(w, map[string]any{"role": "assistant", "content": "unexpected"}, "stop")
	})
	if err := c.SetModelRole("compactionThreshold", "80"); err != nil {
		t.Fatal(err)
	}
	if err := c.SetModelRole("compactionThreshold", "99"); err == nil {
		t.Fatal("unsafe compaction threshold accepted")
	}
	if err := c.SetModelRole("compactionEnabled", "false"); err != nil {
		t.Fatal(err)
	}
	if err := c.SetModelRole("effort", "medium"); err != nil {
		t.Fatal(err)
	}
	if roles, err := c.ModelRoles(); err != nil || roles["effort"] != "medium" || roles["compactionThreshold"] != "80" {
		t.Fatal(roles, err)
	}
	receipt, err := c.Submit(s.ID, strings.Repeat("容量", 25000), "chela-custom", "off", "capacity")
	if err != nil {
		t.Fatal(err)
	}
	run := waitRun(t, c, receipt.RunID)
	if run.State != "failed" || !strings.Contains(run.Reason, "CONTEXT_CAPACITY") || requests.Load() != 0 {
		t.Fatalf("capacity gate: %+v requests=%d", run, requests.Load())
	}
}

func TestMessageAttachmentsReachProviderAndStayScoped(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		data, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		if !strings.Contains(string(data), "image_url") || !strings.Contains(string(data), "attached text") {
			var body struct {
				Messages []struct {
					Role    string
					Content json.RawMessage
				}
			}
			_ = json.Unmarshal(data, &body)
			for _, message := range body.Messages {
				if message.Role == "user" {
					t.Errorf("attachments missing from fixture user message: %s", message.Content)
				}
			}
		}
		requests.Add(1)
		sse(w, map[string]any{"role": "assistant", "content": "已查看附件"}, "stop")
	})
	var config profileModel
	if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &config); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{"url": config.URL, "model": config.Model, "key": "fixture-key", "vision": true})
	if err := c.ConfigureModel(string(raw)); err != nil {
		t.Fatal(err)
	}
	public, err := c.CustomModel()
	if err != nil || !public.HasKey || !public.Vision || public.URL != config.URL {
		t.Fatal("safe model settings", public, err)
	}
	retained, _ := json.Marshal(map[string]any{"url": config.URL, "model": config.Model, "keepKey": true, "vision": true})
	if err := c.ConfigureModel(string(retained)); err != nil {
		t.Fatal(err)
	}
	var after profileModel
	if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &after); err != nil {
		t.Fatal(err)
	}
	key, err := unseal(after.Secret)
	if err != nil || string(key) != "fixture-key" {
		t.Fatal("editing discarded secret", err)
	}
	changed, _ := json.Marshal(map[string]any{"url": "https://other.invalid/v1", "model": config.Model, "keepKey": true})
	if c.ConfigureModel(string(changed)) == nil {
		t.Fatal("retained secret sent to a different endpoint")
	}
	picture := image.NewRGBA(image.Rect(0, 0, 16, 16))
	picture.Set(0, 0, color.White)
	var encodedImage bytes.Buffer
	if err := png.Encode(&encodedImage, picture); err != nil {
		t.Fatal(err)
	}
	imageData := base64.StdEncoding.EncodeToString(encodedImage.Bytes())
	items := []Attachment{{ID: "text", Name: "note.md", MIME: "text/plain", Text: "attached text"}, {ID: "image", Name: "pixel.png", MIME: "image/png", Data: imageData}}
	bad := append([]Attachment{}, items...)
	bad[1].MIME = "image/svg+xml"
	if validateAttachments(bad) == nil {
		t.Fatal("disallowed image accepted")
	}
	request, _ := json.Marshal(map[string]any{"text": "查看图片与引用", "attachments": items})
	receipt, err := c.SubmitContext(s.ID, string(request), "chela-custom", "off", "media-fixture")
	if err != nil {
		t.Fatal(err)
	}
	repeat, err := c.SubmitContext(s.ID, string(request), "chela-custom", "off", "media-fixture")
	if err != nil || repeat.RunID != receipt.RunID {
		t.Fatal("media idempotency failed", repeat, err)
	}
	run := waitRun(t, c, receipt.RunID)
	if run.State != "succeeded" || requests.Load() != 1 {
		t.Fatal(run.State, run.Reason, requests.Load())
	}
	attachment, err := c.Attachment(s.ID, receipt.MessageID, "image")
	if err != nil || attachment.Data != imageData {
		t.Fatal("attachment lost", err)
	}
	other, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.Attachment(other.ID, receipt.MessageID, "image"); err == nil {
		t.Fatal("cross-session attachment exposed")
	}
	snapshot, err := c.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(snapshot)
	if strings.Contains(string(encoded), imageData) || strings.Contains(string(encoded), "attached text") {
		t.Fatal("attachment bodies leaked into polling snapshot")
	}
}

func TestForgetRebuildsPiCompaction(t *testing.T) {
	var summarizing atomic.Bool
	var lastPacket atomic.Value
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		data, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		lastPacket.Store(string(data))
		answer := strings.Repeat("ordinary evidence ", 700)
		if summarizing.Load() {
			answer = "DERIVED_MEMORY_ONLY"
		}
		sse(w, map[string]any{"role": "assistant", "content": answer}, "stop")
	})
	for i := range 4 {
		r, err := c.Submit(s.ID, strings.Repeat("original user evidence ", 420), "chela-custom", "off", fmt.Sprintf("forget-seed-%d", i))
		if err != nil {
			t.Fatal(err)
		}
		if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
			t.Fatal(run.Reason)
		}
	}
	p, _ := json.Marshal(memory.Proposal{CommandID: "forget-derived", SessionID: s.ID, ScopeType: "assistant", Subject: "user", Slot: "detail", Kind: "preference", Content: "DERIVED_MEMORY_ONLY"})
	m, err := c.SaveMemory(string(p))
	if err != nil {
		t.Fatal(err)
	}
	summarizing.Store(true)
	r, err := c.Compact(s.ID, "forget-compact")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	summarizing.Store(false)
	if err = c.ForgetMemory(s.ID, m.ID, "1"); err != nil {
		t.Fatal(err)
	}
	db, _ := c.store.DB()
	var summaries, manifests int
	if err = db.QueryRow("SELECT count(*) FROM pi_entries WHERE entry_type='compaction' AND payload_json LIKE '%DERIVED_MEMORY_ONLY%'").Scan(&summaries); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM context_manifests WHERE manifest_json LIKE '%DERIVED_MEMORY_ONLY%'").Scan(&manifests); err != nil {
		t.Fatal(err)
	}
	if summaries != 0 || manifests != 0 {
		t.Fatal("derived copies survived erasure", summaries, manifests)
	}
	r, err = c.Submit(s.ID, "continue original work", "chela-custom", "off", "forget-continue")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	packet := lastPacket.Load().(string)
	if strings.Contains(packet, "DERIVED_MEMORY_ONLY") || !strings.Contains(packet, "original user evidence") {
		t.Fatal("invalid rebuilt projection", packet)
	}
	var rebuilt, sources int
	if err = db.QueryRow("SELECT count(*) FROM safe_cuts WHERE purpose='rebuild' AND consumed_at IS NOT NULL").Scan(&rebuilt); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM messages WHERE role='user' AND content_json LIKE '%original user evidence%'").Scan(&sources); err != nil {
		t.Fatal(err)
	}
	if rebuilt != 1 || sources != 4 {
		t.Fatal("canonical rebuild or originals missing", rebuilt, sources)
	}
}

func TestContextBudgetCompactsBeforeProvider(t *testing.T) {
	var lastPacket atomic.Value
	var summaries atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var packet struct {
			Tools []json.RawMessage `json:"tools"`
		}
		data, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		if err = json.Unmarshal(data, &packet); err != nil {
			t.Error(err)
			return
		}
		lastPacket.Store(string(data))
		answer := strings.Repeat("retained evidence ", 800)
		if len(packet.Tools) == 0 {
			summaries.Add(1)
			answer = "目标未变，继续用户原始要求，尚未执行其他动作。"
		}
		sse(w, map[string]any{"role": "assistant", "content": answer}, "stop")
	})
	for i := range 4 {
		r, err := c.Submit(s.ID, fmt.Sprintf("LATEST-%d ", i)+strings.Repeat("user constraint ", 700), "chela-custom", "off", fmt.Sprintf("budget-%d", i))
		if err != nil {
			t.Fatal(err)
		}
		if run := waitRun(t, c, r.RunID); run.State != "succeeded" {
			t.Fatal(run.Reason)
		}
	}
	if summaries.Load() != 1 || !strings.Contains(lastPacket.Load().(string), "LATEST-3") {
		t.Fatal("budget compaction lost current input", summaries.Load())
	}
	db, _ := c.store.DB()
	var cuts int
	if err := db.QueryRow("SELECT count(*) FROM safe_cuts WHERE purpose='compact' AND consumed_at IS NOT NULL").Scan(&cuts); err != nil {
		t.Fatal(err)
	}
	if cuts != 1 {
		t.Fatal("compaction not committed", cuts)
	}
}

func TestHybridMemoryIndexIsolationAndRotation(t *testing.T) {
	var unavailable atomic.Bool
	c, a := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"data":[{"id":"chat-fixture"}]}`)
			return
		}
		if unavailable.Load() {
			w.WriteHeader(503)
			return
		}
		var p struct{ Model, Input string }
		if json.NewDecoder(r.Body).Decode(&p) != nil {
			t.Error("invalid embedding request")
			return
		}
		values := []float64{1, 0, 0}
		if strings.Contains(p.Input, "园艺") {
			values = []float64{0, 1, 0}
		}
		if p.Model == "encoder-b" {
			values = []float64{values[1], values[0]}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"model": p.Model, "data": []any{map[string]any{"index": 0, "embedding": values}}, "usage": map[string]int{"prompt_tokens": 4}})
	})
	var profile profileModel
	if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &profile); err != nil {
		t.Fatal(err)
	}
	if _, err := c.ConnectMagpie(profile.URL, "fixture-key"); err != nil {
		t.Fatal(err)
	}
	var global memory.Item
	for i, p := range []memory.Proposal{
		{ScopeType: "assistant", Subject: "user", Slot: "release", Kind: "procedure", Content: "部署需要审批"},
		{ScopeType: "project", Subject: "project", Slot: "secret", Kind: "fact", Content: "私密区域的上线资料"},
		{ScopeType: "assistant", Subject: "user", Slot: "garden", Kind: "fact", Content: "园艺只在周末处理"},
	} {
		p.CommandID = fmt.Sprintf("vector-%d", i)
		p.SessionID = a.ID
		raw, _ := json.Marshal(p)
		item, err := c.SaveMemory(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			global = item
		}
	}
	b, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	if err = c.SetModelRole("embedding", "encoder-a"); err != nil {
		t.Fatal(err)
	}
	for range 10 {
		if err = c.indexMemory(context.Background()); err != nil && !errors.Is(err, sql.ErrNoRows) {
			t.Fatal(err)
		}
	}
	items, err := c.Memories(b.ID, "上线流程")
	if err != nil || len(items) != 1 || items[0].ID != global.ID {
		t.Fatal("semantic query or scope isolation", items, err)
	}
	exact, err := c.Memories(b.ID, global.ID)
	if err != nil || len(exact) != 1 || exact[0].ID != global.ID {
		t.Fatal("exact memory ID", exact, err)
	}
	items, err = c.Memories(b.ID, "审")
	if err != nil || len(items) != 1 {
		t.Fatal("bounded single Han search", items, err)
	}
	unavailable.Store(true)
	items, err = c.Memories(b.ID, "审批")
	if err != nil || len(items) != 1 || items[0].ID != global.ID {
		t.Fatal("lexical fallback", items, err)
	}
	unavailable.Store(false)
	if err = c.SetModelRole("embedding", "encoder-b"); err != nil {
		t.Fatal(err)
	}
	db, _ := c.store.DB()
	var active string
	if err = db.QueryRow("SELECT requested_model FROM memory_encoders WHERE state='active'").Scan(&active); err != nil || active != "encoder-a" {
		t.Fatal("old index discarded before replacement", active, err)
	}
	for range 6 {
		if err = c.indexMemory(context.Background()); err != nil && !errors.Is(err, sql.ErrNoRows) {
			t.Fatal(err)
		}
	}
	if err = db.QueryRow("SELECT requested_model FROM memory_encoders WHERE state='active'").Scan(&active); err != nil || active != "encoder-b" {
		t.Fatal("index rotation failed", active, err)
	}
	items, err = c.Memories(b.ID, "上线流程")
	if err != nil || len(items) != 1 || items[0].ID != global.ID {
		t.Fatal("mixed vector spaces", items, err)
	}
	if err = c.ForgetMemory(b.ID, global.ID, "1"); err != nil {
		t.Fatal(err)
	}
	items, err = c.Memories(b.ID, "上线流程")
	if err != nil || len(items) != 0 {
		t.Fatal("forgotten vector survived", items, err)
	}
}

func TestLegacyMemoryClassificationAndRollback(t *testing.T) {
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) { t.Error("migration must not call a model") })
	root := filepath.Join(c.profile, "data", "memory")
	if err := os.MkdirAll(filepath.Join(root, "topics"), 0700); err != nil {
		t.Fatal(err)
	}
	index := []byte("# Memory\n- 部署需要审批 [→ topics/conventions.md]\n")
	topic := []byte("# conventions\n\n### 部署需要审批\n_source: user | saved: 2026-11-10_\n\n详细说明\n")
	if err := os.WriteFile(filepath.Join(root, "MEMORY.md"), index, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "topics", "conventions.md"), topic, 0600); err != nil {
		t.Fatal(err)
	}
	legacyPath := filepath.Join(c.profile, "chela-memory.db")
	old, err := sql.Open("sqlite", filepath.ToSlash(legacyPath))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = old.Exec("CREATE TABLE memories(id INTEGER PRIMARY KEY,content TEXT,embedding TEXT,metadata TEXT,created_at TEXT)"); err != nil {
		t.Fatal(err)
	}
	if _, err = old.Exec("INSERT INTO memories VALUES(1,?,'[0.4,0.5]','{}','2026-11-10'),(2,'password=secret123','[0,1]','{}','2026-11-10')", "部署需要审批\n详细说明"); err != nil {
		t.Fatal(err)
	}
	if err = old.Close(); err != nil {
		t.Fatal(err)
	}
	db, _ := c.store.DB()
	if _, err = db.Exec("CREATE TRIGGER reject_legacy_memory BEFORE INSERT ON legacy_import_map WHEN new.target_type='legacy_memory' BEGIN SELECT RAISE(ABORT,'fixture import rejection'); END"); err != nil {
		t.Fatal(err)
	}
	if _, err = c.LegacyMemories(); err == nil {
		t.Fatal("partial migration accepted")
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM legacy_memory_candidates").Scan(&count); err != nil || count != 0 {
		t.Fatal("partial import retained", count, err)
	}
	if _, err = db.Exec("DROP TRIGGER reject_legacy_memory"); err != nil {
		t.Fatal(err)
	}
	items, err := c.LegacyMemories()
	if err != nil || len(items) != 2 {
		t.Fatal("import counts", items, err)
	}
	var candidate memory.LegacyCandidate
	for _, item := range items {
		if item.State == "pending" {
			candidate = item
		} else if item.Content != "" {
			t.Fatal("credential copied")
		}
	}
	var sources []any
	if err = json.Unmarshal(candidate.Sources, &sources); err != nil || len(sources) != 3 {
		t.Fatal("duplicate provenance missing", sources, err)
	}
	items, err = c.LegacyMemories()
	if err != nil || len(items) != 2 {
		t.Fatal("duplicate import", items, err)
	}
	before, err := c.Memories(s.ID, "审批")
	if err != nil || len(before) != 0 {
		t.Fatal("unclassified claim published", before, err)
	}
	raw, _ := json.Marshal(map[string]any{"id": candidate.ID, "session": s.ID, "scope": "project", "slot": "legacy release", "kind": "procedure", "content": "部署需要审批"})
	if err = c.ClassifyLegacyMemory(string(raw)); err != nil {
		t.Fatal(err)
	}
	if err = c.ClassifyLegacyMemory(string(raw)); err != nil {
		t.Fatal("duplicate classification", err)
	}
	accepted, err := c.Memories(s.ID, "审批")
	if err != nil || len(accepted) != 1 {
		t.Fatal("classification", accepted, err)
	}
	if err = c.ForgetMemory(s.ID, accepted[0].ID, "1"); err != nil {
		t.Fatal(err)
	}
	if err = c.ClassifyLegacyMemory(string(raw)); err == nil {
		t.Fatal("forgotten import resurrected")
	}
	if err = db.QueryRow("SELECT count(*) FROM embeddings").Scan(&count); err != nil || count != 0 {
		t.Fatal("unknown vector imported", count, err)
	}
	data, err := os.ReadFile(filepath.Join(root, "topics", "conventions.md"))
	if err != nil || string(data) != string(topic) {
		t.Fatal("source archive changed", err)
	}
}

func waitApproval(t *testing.T, c *Chat) Approval {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		rows, err := c.Approvals()
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) > 0 {
			return rows[0]
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("approval did not arrive")
	return Approval{}
}

func TestPiAutomaticRetry(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(503)
			fmt.Fprint(w, `{"error":{"message":"fixture temporarily unavailable","type":"server_error"}}`)
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "retry complete"}, "stop")
	})
	receipt, err := c.Submit(s.ID, "retry", "chela-custom", "off", "retry-1")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatalf("retry: %+v", run)
	}
	db, _ := c.store.DB()
	var permits, failed int
	if err := db.QueryRow("SELECT count(*),sum(status='failed') FROM model_requests").Scan(&permits, &failed); err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 2 || permits != 2 || failed != 1 {
		t.Fatalf("requests=%d permits=%d failed=%d", requests.Load(), permits, failed)
	}
}

func TestMagpieCatalogAndRoute(t *testing.T) {
	var offline atomic.Bool
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" {
			if offline.Load() {
				w.WriteHeader(503)
				return
			}
			if r.Header.Get("If-None-Match") == "catalog-1" {
				w.WriteHeader(304)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("ETag", "catalog-1")
			fmt.Fprint(w, `{"data":[{"id":"group/fixture","display_name":"Fixture group","context_window":64000,"max_output_tokens":4096,"reasoning":true,"reasoning_levels":["off","low"],"tool_call":true,"modalities":{"input":["text"],"output":["text"]}},{"id":"unknown/fixture","display_name":"Unknown limits"}]}`)
			return
		}
		w.Header().Set("X-Magpie-Model", "upstream/actual-fixture")
		sse(w, map[string]any{"role": "assistant", "content": "magpie route reply"}, "stop")
	})
	var configured profileModel
	if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &configured); err != nil {
		t.Fatal(err)
	}
	status, err := c.ConnectMagpie(configured.URL, "fixture-key")
	if err != nil || status.Count != 2 {
		t.Fatalf("connect=%+v err=%v", status, err)
	}
	if _, err := c.RefreshMagpie(); err != nil {
		t.Fatal(err)
	}
	infos, _, _, _, err := c.catalog()
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range infos {
		if m.ID == "magpie:unknown/fixture" && m.ContextWindow != 0 {
			t.Fatal("unknown limit fabricated")
		}
	}
	offline.Store(true)
	if _, err := c.RefreshMagpie(); err == nil {
		t.Fatal("offline refresh succeeded")
	}
	if status, err := c.MagpieStatus(); err != nil || status.Count != 2 {
		t.Fatal("offline removed catalog")
	}
	receipt, err := c.Submit(s.ID, "route fixture", "magpie:group/fixture", "off", "magpie-1")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	db, _ := c.store.DB()
	var actual string
	if err := db.QueryRow("SELECT actual_model FROM model_requests WHERE attempt_id=(SELECT current_attempt_id FROM runs WHERE run_id=?)", receipt.RunID).Scan(&actual); err != nil {
		t.Fatal(err)
	}
	if actual != "upstream/actual-fixture" {
		t.Fatalf("actual=%s", actual)
	}
}

func TestSteerAndFollowUpOwnership(t *testing.T) {
	called, release := make(chan struct{}, 1), make(chan struct{})
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Role    string `json:"role"`
				Content any    `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		n := requests.Add(1)
		if n == 1 {
			called <- struct{}{}
			select {
			case <-release:
			case <-r.Context().Done():
				return
			}
		}
		if n == 2 {
			var steer, follow int
			for _, m := range body.Messages {
				if m.Role == "user" {
					if strings.Contains(fmt.Sprint(m.Content), "steer-now") {
						steer++
					}
					if strings.Contains(fmt.Sprint(m.Content), "follow-later") {
						follow++
					}
				}
			}
			if steer != 1 || follow != 0 {
				t.Errorf("steer=%d ordinary=%d", steer, follow)
			}
		}
		sse(w, map[string]any{"role": "assistant", "content": fmt.Sprintf("reply %d", n)}, "stop")
	})
	first, err := c.Submit(s.ID, "initial", "chela-custom", "off", "steer-first")
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-called:
	case <-time.After(10 * time.Second):
		t.Fatal("provider absent")
	}
	steer, err := c.Steer(first.RunID, "steer-now", "steer-input")
	if err != nil {
		t.Fatal(err)
	}
	again, err := c.Steer(first.RunID, "steer-now", "steer-input")
	if err != nil || steer.MessageID != again.MessageID {
		t.Fatalf("duplicate: %+v %v", again, err)
	}
	queued, err := c.Submit(s.ID, "follow-later", "chela-custom", "off", "follow-input")
	if err != nil {
		t.Fatal(err)
	}
	close(release)
	for _, id := range []string{first.RunID, queued.RunID} {
		if run := waitRun(t, c, id); run.State != "succeeded" {
			t.Fatal(run.Reason)
		}
	}
	if requests.Load() != 3 {
		t.Fatalf("requests=%d", requests.Load())
	}
	db, _ := c.store.DB()
	var runs, consumed, projected int
	if err := db.QueryRow("SELECT count(*) FROM runs").Scan(&runs); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT count(*) FROM run_inputs WHERE run_id=? AND state='consumed'", first.RunID).Scan(&consumed); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT count(*) FROM messages WHERE message_id=? AND entry_id IS NOT NULL", steer.MessageID).Scan(&projected); err != nil {
		t.Fatal(err)
	}
	if runs != 2 || consumed != 2 || projected != 1 {
		t.Fatalf("runs=%d consumed=%d projected=%d", runs, consumed, projected)
	}
}

func TestEditKeepsOriginalBranch(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Role    string `json:"role"`
				Content any    `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if requests.Add(1) == 2 {
			for _, m := range body.Messages {
				if strings.Contains(fmt.Sprint(m.Content), "original input") {
					t.Error("edited branch retained replaced input")
				}
			}
		}
		sse(w, map[string]any{"role": "assistant", "content": "fixture reply"}, "stop")
	})
	first, err := c.Submit(s.ID, "original input", "chela-custom", "off", "edit-seed")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, first.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	edited, err := c.EditMessage(s.ID, first.MessageID, "corrected input", "chela-custom", "off", "edit-new")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, edited.RunID); run.State != "succeeded" {
		t.Fatal(run.Reason)
	}
	branches, err := c.Branches(s.ID)
	if err != nil || len(branches) != 2 {
		t.Fatalf("branches=%d err=%v", len(branches), err)
	}
	original, err := c.SwitchBranch(s.ID, s.BranchID)
	if err != nil {
		t.Fatal(err)
	}
	if len(original.Messages) != 2 || original.Messages[0].Content != "original input" {
		t.Fatalf("original changed: %+v", original.Messages)
	}
}

func TestStdoutPollutionInterrupts(t *testing.T) {
	node, err := filepath.Abs("../../bin/runtime/node.exe")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(node, "-e", `process.stdout.write(JSON.stringify({protocol_version:1,worker_id:"fixture",epoch:1,worker_seq:1,method:"worker.ready",payload:{sdk_version:"1.5.2"}})+"\nconsole pollution\n");setInterval(()=>{},1000)`)
	cmd.SysProcAttr = piProcessAttrs
	input, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	output, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	w := &piWorker{id: "fixture", epoch: 1, cmd: cmd, input: input, done: make(chan struct{}), ready: make(chan struct{})}
	t.Cleanup(w.stop)
	go w.read(output, func() {})
	select {
	case <-w.done:
		if !strings.Contains(w.err.Error(), "stdout") {
			t.Fatal(w.err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("polluted worker did not exit")
	}
}

func TestCheckpointReceiptReplay(t *testing.T) {
	c, s := fixtureChat(t, func(http.ResponseWriter, *http.Request) { t.Error("provider should not run") })
	c.started = true // Drive the persisted claim directly to lose only the acknowledgement.
	receipt, err := c.Submit(s.ID, "fixture", "chela-custom", "off", "ack-1")
	if err != nil {
		t.Fatal(err)
	}
	run, err := c.claimRun()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c.openPi(run, c.pool[s.ID]); err != nil {
		t.Fatal(err)
	}
	p := checkpoint{Batch: "lost-ack", Generation: run.Generation, Lease: run.LeaseToken, Header: json.RawMessage(`{"type":"session","version":3,"id":"fixture"}`), Entries: []json.RawMessage{}, Boundary: "open"}
	raw, _ := json.Marshal(p)
	ack, err := c.checkpoint(context.Background(), run, raw, false)
	if err != nil {
		t.Fatal(err)
	}
	again, err := c.checkpoint(context.Background(), run, raw, false)
	if err != nil || string(again) != string(ack) {
		t.Fatalf("replay: %s %v", again, err)
	}
	p.Boundary = "changed"
	changed, _ := json.Marshal(p)
	if _, err := c.checkpoint(context.Background(), run, changed, false); err == nil {
		t.Fatal("changed replay accepted")
	}
	var count int
	db, _ := c.store.DB()
	if err := db.QueryRow("SELECT count(*) FROM checkpoint_receipts WHERE attempt_id=?", run.AttemptID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("duplicate commits=%d", count)
	}
	if err := c.settleRun(run, "cancelled", "fixture finished"); err != nil {
		t.Fatal(err)
	}
	if got, _ := c.GetRun(receipt.RunID); got.State != "cancelled" {
		t.Fatal(got.State)
	}
}

func TestWriteReceiptFailureAndRecovery(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		n := requests.Add(1)
		if n > 1 {
			sse(w, map[string]any{"role": "assistant", "content": "reconciled"}, "stop")
			return
		}
		sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "unknown-write", "type": "function", "function": map[string]string{"name": "write_file", "arguments": `{"path":"unknown.txt","content":"written once"}`}}}}, "tool_calls")
	})
	db, _ := c.store.DB()
	if _, err := db.Exec(`CREATE TRIGGER reject_result BEFORE UPDATE OF result_json ON tool_invocations WHEN new.tool_id='write_file' AND new.result_json IS NOT NULL BEGIN SELECT RAISE(ABORT,'fixture receipt failure'); END`); err != nil {
		t.Fatal(err)
	}
	receipt, err := c.Submit(s.ID, "write fixture", "chela-custom", "off", "unknown-1")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.ResolveApproval(waitApproval(t, c).ID, true); err != nil {
		t.Fatal(err)
	}
	run := waitRun(t, c, receipt.RunID)
	if run.State != "failed" || !strings.Contains(run.Reason, "TOOL_OUTCOME_UNKNOWN") || requests.Load() != 1 {
		t.Fatalf("unknown side effect continued: %+v requests=%d", run, requests.Load())
	}
	data, err := os.ReadFile(filepath.Join(s.Project, "unknown.txt"))
	if err != nil || string(data) != "written once" {
		t.Fatalf("effect=%s error=%v", data, err)
	}
	var state string
	if err := db.QueryRow("SELECT state FROM tool_invocations WHERE run_id=?", run.ID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != "outcome_unknown" {
		t.Fatal(state)
	}
	if _, err := db.Exec("DROP TRIGGER reject_result"); err != nil {
		t.Fatal(err)
	}
	recovery, err := c.Recover(run.ID, "unknown-recover")
	if err != nil {
		t.Fatal(err)
	}
	if got := waitRun(t, c, recovery.RunID); got.State != "succeeded" {
		t.Fatalf("recover: %+v", got)
	}
}

func TestAbruptWorkerExitKeepsKnownWrite(t *testing.T) {
	called := make(chan struct{}, 1)
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		n := requests.Add(1)
		var body struct {
			Messages []struct {
				Role string `json:"role"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if n == 2 {
			called <- struct{}{}
			select {
			case <-r.Context().Done():
			case <-time.After(10 * time.Second):
			}
			return
		}
		if n > 3 {
			sse(w, map[string]any{"role": "assistant", "content": "known receipt reused"}, "stop")
			return
		}
		sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": fmt.Sprintf("known-%d", n), "type": "function", "function": map[string]string{"name": "write_file", "arguments": `{"path":"known.txt","content":"original write"}`}}}}, "tool_calls")
	})
	receipt, err := c.Submit(s.ID, "write known fixture", "chela-custom", "off", "known-1")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.ResolveApproval(waitApproval(t, c).ID, true); err != nil {
		t.Fatal(err)
	}
	select {
	case <-called:
	case <-time.After(10 * time.Second):
		t.Fatal("second request did not start")
	}
	c.mu.Lock()
	c.pool[s.ID].stop()
	c.mu.Unlock()
	if run := waitRun(t, c, receipt.RunID); run.State != "interrupted" {
		t.Fatalf("crash: %+v", run)
	}
	// Changing the file makes an accidental replay observable even for idempotent writes.
	if err := os.WriteFile(filepath.Join(s.Project, "known.txt"), []byte("user edit after crash"), 0600); err != nil {
		t.Fatal(err)
	}
	runtime, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool[s.ID] = worker
	c.mu.Unlock()
	recovery, err := c.Recover(receipt.RunID, "known-recover")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, recovery.RunID); run.State != "succeeded" {
		t.Fatalf("recover: %+v", run)
	}
	data, err := os.ReadFile(filepath.Join(s.Project, "known.txt"))
	if err != nil || string(data) != "user edit after crash" {
		t.Fatalf("write repeated: %s %v", data, err)
	}
}

func fixtureChat(t *testing.T, handler http.HandlerFunc) (*Chat, ChatSession) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	profile := t.TempDir()
	c, closeChat := New(profile, storage.New(profile))
	c.config = t.TempDir()
	t.Cleanup(closeChat)
	if err := c.Configure(server.URL+"/v1", "fixture", "fixture-key"); err != nil {
		t.Fatal(err)
	}
	session, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	workspace := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspace, "fixture.txt"), []byte("fixture contents"), 0600); err != nil {
		t.Fatal(err)
	}
	session, err = c.update(session.ID, func(s *ChatSession) { s.Project = workspace })
	if err != nil {
		t.Fatal(err)
	}
	runtime, err := filepath.Abs("../../bin/runtime")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(runtime, "chat.cjs")); err != nil {
		t.Fatal("run node native/scripts/build-agent.mjs before runtime tests")
	}
	worker, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	c.pool[session.ID] = worker
	return c, session
}

func TestCheckpointRejectsBeforeTools(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "rejected-call", "type": "function", "function": map[string]string{"name": "read_file", "arguments": `{"path":"fixture.txt"}`}}}}, "tool_calls")
	})
	db, _ := c.store.DB()
	if _, err := db.Exec(`CREATE TRIGGER reject_assistant BEFORE INSERT ON pi_entries WHEN json_extract(new.payload_json,'$.message.role')='assistant' BEGIN SELECT RAISE(ABORT,'fixture checkpoint rejection'); END`); err != nil {
		t.Fatal(err)
	}
	receipt, err := c.Submit(s.ID, "must not execute", "chela-custom", "off", "reject")
	if err != nil {
		t.Fatal(err)
	}
	run := waitRun(t, c, receipt.RunID)
	if run.State != "failed" || !strings.Contains(run.Reason, "checkpoint rejection") {
		t.Fatalf("rejected: %s %s", run.State, run.Reason)
	}
	var calls int
	if err := db.QueryRow("SELECT count(*) FROM tool_invocations").Scan(&calls); err != nil {
		t.Fatal(err)
	}
	if calls != 0 || requests.Load() != 1 {
		t.Fatalf("crossed barrier: tools=%d requests=%d", calls, requests.Load())
	}
}

func TestApprovalBeforeWrite(t *testing.T) {
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Role string `json:"role"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		if request.Messages[len(request.Messages)-1].Role == "tool" {
			sse(w, map[string]any{"role": "assistant", "content": "write complete"}, "stop")
			return
		}
		sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "write-call", "type": "function", "function": map[string]string{"name": "write_file", "arguments": `{"path":"created.txt","content":"approved text"}`}}}}, "tool_calls")
	})
	receipt, err := c.Submit(s.ID, "write file", "chela-custom", "off", "write")
	if err != nil {
		t.Fatal(err)
	}
	var approval Approval
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		rows, err := c.Approvals()
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) > 0 {
			approval = rows[0]
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if approval.ID == "" {
		run, _ := c.GetRun(receipt.RunID)
		t.Fatalf("missing approval: %s", run.Reason)
	}
	if _, err := os.Stat(filepath.Join(s.Project, "created.txt")); !os.IsNotExist(err) {
		t.Fatal("write happened before approval")
	}
	if approval.Preview != "approved text" {
		t.Fatal("approval did not expose final content")
	}
	if !approval.CanAllowSession {
		t.Fatal("file write missing session grant action")
	}
	if err := c.AllowSessionApproval(approval.ID); err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatalf("write: %s", run.Reason)
	}
	data, err := os.ReadFile(filepath.Join(s.Project, "created.txt"))
	if err != nil || string(data) != "approved text" {
		t.Fatalf("file=%s error=%v", data, err)
	}
	second, err := c.Submit(s.ID, "再写一次", "chela-custom", "off", "session-grant-repeat")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, second.RunID); run.State != "succeeded" {
		t.Fatal("session grant not applied", run.Reason)
	}
	other, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	other, err = c.update(other.ID, func(item *ChatSession) { item.Project = s.Project })
	if err != nil {
		t.Fatal(err)
	}
	runtime, err := filepath.Abs("../../bin/runtime")
	if err != nil {
		t.Fatal(err)
	}
	extra, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool[other.ID] = extra
	c.mu.Unlock()
	third, err := c.Submit(other.ID, "另一个会话", "chela-custom", "off", "session-grant-isolated")
	if err != nil {
		t.Fatal(err)
	}
	if next := waitApproval(t, c); next.SessionID != other.ID {
		t.Fatal("grant leaked across sessions", next)
	}
	if err = c.Cancel(third.RunID); err != nil {
		t.Fatal(err)
	}
}

func TestPiCompactionCommit(t *testing.T) {
	var summaries atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"data":[{"id":"summary-fixture","display_name":"Summary fixture","context_window":128000,"max_output_tokens":8192}]}`)
			return
		}
		var request struct {
			Model string `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		if request.Model == "summary-fixture" {
			summaries.Add(1)
		}
		sse(w, map[string]any{"role": "assistant", "content": strings.Repeat("context note ", 1000)}, "stop")
	})
	for i := range 3 {
		receipt, err := c.Submit(s.ID, strings.Repeat("user evidence ", 750), "chela-custom", "off", fmt.Sprintf("long-%d", i))
		if err != nil {
			t.Fatal(err)
		}
		if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
			t.Fatalf("seed: %s", run.Reason)
		}
	}
	var provider profileModel
	if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &provider); err != nil {
		t.Fatal(err)
	}
	if _, err := c.ConnectMagpie(provider.URL, "fixture-key"); err != nil {
		t.Fatal(err)
	}
	if err := c.SetModelRole("compaction", "magpie:summary-fixture"); err != nil {
		t.Fatal(err)
	}
	receipt, err := c.Compact(s.ID, "compact-1")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatalf("compaction: %s", run.Reason)
	}
	db, _ := c.store.DB()
	var snapshots, entries int
	if err := db.QueryRow("SELECT count(*) FROM context_snapshots WHERE status='valid'").Scan(&snapshots); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT count(*) FROM pi_entries WHERE entry_type='compaction'").Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if snapshots != 1 || entries != 1 {
		t.Fatalf("snapshots=%d compactions=%d", snapshots, entries)
	}
	current, err := c.find(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if summaries.Load() == 0 || current.ModelID != "chela-custom" {
		t.Fatalf("summary calls=%d chat model=%s", summaries.Load(), current.ModelID)
	}
}

func TestAutomaticCompactionCommitBoundary(t *testing.T) {
	for _, reject := range []bool{false, true} {
		t.Run(fmt.Sprintf("reject=%v", reject), func(t *testing.T) {
			var requests atomic.Int32
			c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
				n := requests.Add(1)
				if n == 4 {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(400)
					fmt.Fprint(w, `{"error":{"message":"maximum context length exceeded","type":"invalid_request_error"}}`)
					return
				}
				sse(w, map[string]any{"role": "assistant", "content": strings.Repeat("context evidence ", 800)}, "stop")
			})
			for i := range 3 {
				// Leave room for tool schemas: this fixture exercises upstream overflow, not the local preflight gate.
				receipt, err := c.Submit(s.ID, strings.Repeat("user evidence ", 600), "chela-custom", "off", fmt.Sprintf("seed-%d", i))
				if err != nil {
					t.Fatal(err)
				}
				if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
					t.Fatal(run.Reason)
				}
			}
			db, _ := c.store.DB()
			if reject {
				if _, err := db.Exec(`CREATE TRIGGER reject_compaction BEFORE INSERT ON pi_entries WHEN new.entry_type='compaction' BEGIN SELECT RAISE(ABORT,'fixture compaction rejection'); END`); err != nil {
					t.Fatal(err)
				}
			}
			receipt, err := c.Submit(s.ID, "continue latest request", "chela-custom", "off", "overflow")
			if err != nil {
				t.Fatal(err)
			}
			run := waitRun(t, c, receipt.RunID)
			var entries, snapshots, agentRequests, compactRequests int
			if err := db.QueryRow("SELECT count(*) FROM pi_entries WHERE entry_type='compaction'").Scan(&entries); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow("SELECT count(*) FROM context_snapshots").Scan(&snapshots); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow("SELECT sum(request_kind='agent'),sum(request_kind='compaction') FROM model_requests").Scan(&agentRequests, &compactRequests); err != nil {
				t.Fatal(err)
			}
			if compactRequests < 1 || agentRequests+compactRequests != int(requests.Load()) {
				t.Fatalf("ungated requests: agent=%d compact=%d upstream=%d", agentRequests, compactRequests, requests.Load())
			}
			if reject {
				if run.State != "failed" || !strings.Contains(run.Reason, "compaction rejection") || entries != 0 || snapshots != 0 || agentRequests != 4 {
					t.Fatalf("rollback state=%s reason=%s entries=%d snapshots=%d requests=%d", run.State, run.Reason, entries, snapshots, requests.Load())
				}
			} else if run.State != "succeeded" || entries != 1 || snapshots != 1 || agentRequests != 5 {
				t.Fatalf("compact state=%s reason=%s entries=%d snapshots=%d requests=%d", run.State, run.Reason, entries, snapshots, requests.Load())
			}
		})
	}
}

func TestCheckpointDelay(t *testing.T) {
	modelCalled := make(chan struct{}, 1)
	releaseModel := make(chan struct{})
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case modelCalled <- struct{}{}:
		default:
		}
		<-releaseModel
		sse(w, map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "delayed-call", "type": "function", "function": map[string]string{"name": "write_file", "arguments": `{"path":"never.txt","content":"no"}`}}}}, "tool_calls")
	})
	receipt, err := c.Submit(s.ID, "delay file", "chela-custom", "off", "delay")
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-modelCalled:
	case <-time.After(10 * time.Second):
		t.Fatal("provider was not reached")
	}
	db, _ := c.store.DB()
	tx, err := db.BeginTx(context.Background(), &sql.TxOptions{})
	if err != nil {
		t.Fatal(err)
	}
	close(releaseModel)
	time.Sleep(250 * time.Millisecond)
	var count int
	if err := tx.QueryRow("SELECT count(*) FROM tool_invocations").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("tool planned before checkpoint commit")
	}
	if _, err := os.Stat(filepath.Join(s.Project, "never.txt")); !os.IsNotExist(err) {
		t.Fatal("side effect before acknowledgement")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := c.Cancel(receipt.RunID); err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "cancelled" {
		t.Fatalf("cancel: %s %s", run.State, run.Reason)
	}
}

func sse(w http.ResponseWriter, delta any, finish string) {
	w.Header().Set("Content-Type", "text/event-stream")
	for _, event := range []any{
		map[string]any{"id": "fixture", "object": "chat.completion.chunk", "model": "fixture", "choices": []any{map[string]any{"index": 0, "delta": delta, "finish_reason": nil}}},
		map[string]any{"id": "fixture", "object": "chat.completion.chunk", "model": "fixture", "choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": finish}}, "usage": map[string]int{"prompt_tokens": 20, "completion_tokens": 5, "total_tokens": 25}},
	} {
		data, _ := json.Marshal(event)
		fmt.Fprintf(w, "data: %s\n\n", data)
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
}

func waitRun(t *testing.T, c *Chat, id string) Run {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		run, err := c.GetRun(id)
		if err != nil {
			t.Fatal(err)
		}
		if terminalRun(run.State) {
			return run
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("run did not settle")
	return Run{}
}

func TestPersistentPiRoundTrip(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Role    string `json:"role"`
				Content any    `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		n := requests.Add(1)
		if n == 2 {
			found := false
			for _, m := range request.Messages {
				if m.Role == "assistant" && strings.Contains(fmt.Sprint(m.Content), "fixture reply") {
					found = true
				}
			}
			if !found {
				t.Error("canonical first reply absent from second request")
			}
		}
		sse(w, map[string]any{"role": "assistant", "content": "fixture reply"}, "stop")
	})
	first, err := c.Submit(s.ID, "first", "chela-custom", "off", "command-1")
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := c.Submit(s.ID, "first", "chela-custom", "off", "command-1")
	if err != nil || duplicate.RunID != first.RunID {
		t.Fatalf("duplicate receipt: %+v %v", duplicate, err)
	}
	if _, err := c.Submit(s.ID, "changed", "chela-custom", "off", "command-1"); err == nil {
		t.Fatal("changed command was accepted")
	}
	if run := waitRun(t, c, first.RunID); run.State != "succeeded" {
		t.Fatalf("first: %+v", run)
	}
	profile, config := c.profile, c.config
	identity, _ := c.store.Identity()
	c.shutdown()
	reopened, closeReopened := New(profile, storage.New(profile))
	reopened.config = config
	t.Cleanup(closeReopened)
	runtime, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	reopened.pool[s.ID] = worker
	c = reopened
	if got, err := c.store.Identity(); err != nil || got != identity {
		t.Fatalf("identity changed: %s %v", got, err)
	}
	second, err := c.Submit(s.ID, "second", "chela-custom", "off", "command-2")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, second.RunID); run.State != "succeeded" {
		t.Fatalf("second: %+v", run)
	}
	if requests.Load() != 2 {
		t.Fatalf("requests=%d", requests.Load())
	}
	db, _ := c.store.DB()
	var entries, manifests int
	if err := db.QueryRow("SELECT count(*) FROM pi_entries WHERE session_id=?", s.ID).Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT count(*) FROM context_manifests").Scan(&manifests); err != nil {
		t.Fatal(err)
	}
	if entries < 6 || manifests != 2 {
		t.Fatalf("entries=%d manifests=%d", entries, manifests)
	}
}

func TestIndependentCancellationAndRecovery(t *testing.T) {
	started := make(chan struct{}, 1)
	c, a := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Content any `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if strings.Contains(fmt.Sprint(body.Messages[len(body.Messages)-1].Content), "hold") {
			select {
			case started <- struct{}{}:
			default:
			}
			<-r.Context().Done()
			return
		}
		sse(w, map[string]any{"role": "assistant", "content": "isolated reply"}, "stop")
	})
	first, err := c.Submit(a.ID, "hold", "chela-custom", "off", "hold-1")
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(10 * time.Second):
		t.Fatal("A did not start")
	}
	b, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	runtime, _ := filepath.Abs("../../bin/runtime")
	worker, err := startPiWorker(runtime)
	if err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.pool[b.ID] = worker
	c.mu.Unlock()
	second, err := c.Submit(b.ID, "reply B", "chela-custom", "off", "b-1")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Cancel(first.RunID); err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, first.RunID); run.State != "cancelled" {
		t.Fatalf("A: %s %s", run.State, run.Reason)
	}
	if run := waitRun(t, c, second.RunID); run.State != "succeeded" {
		t.Fatalf("B: %s %s", run.State, run.Reason)
	}
	recovery, err := c.Recover(first.RunID, "recover-A")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, recovery.RunID); run.State != "succeeded" {
		t.Fatalf("recovery: %s %s", run.State, run.Reason)
	}
	branches, err := c.Branches(a.ID)
	if err != nil || len(branches) != 2 {
		t.Fatalf("branches=%+v %v", branches, err)
	}
	db, _ := c.store.DB()
	var source string
	if err := db.QueryRow("SELECT recovery_of_run_id FROM runs WHERE run_id=?", recovery.RunID).Scan(&source); err != nil || source != first.RunID {
		t.Fatalf("recovery source %s %v", source, err)
	}
}

func TestManagedToolBatch(t *testing.T) {
	var requests atomic.Int32
	c, s := fixtureChat(t, func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			calls := []any{}
			for i := range 2 {
				calls = append(calls, map[string]any{"index": i, "id": fmt.Sprintf("call-%d", i), "type": "function", "function": map[string]string{"name": "read_file", "arguments": `{"path":"fixture.txt"}`}})
			}
			sse(w, map[string]any{"role": "assistant", "tool_calls": calls}, "tool_calls")
		} else {
			sse(w, map[string]any{"role": "assistant", "content": "tools complete"}, "stop")
		}
	})
	receipt, err := c.Submit(s.ID, "read the file twice", "chela-custom", "off", "tools-1")
	if err != nil {
		t.Fatal(err)
	}
	if run := waitRun(t, c, receipt.RunID); run.State != "succeeded" {
		t.Fatalf("tools: %+v", run)
	}
	db, _ := c.store.DB()
	var count int
	if err := db.QueryRow("SELECT count(*) FROM tool_invocations WHERE state='succeeded'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 || requests.Load() != 2 {
		t.Fatalf("tools=%d requests=%d", count, requests.Load())
	}
}
