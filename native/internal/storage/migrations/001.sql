-- Chela v1 target schema specification. Never run over an existing user DB.
-- S00 inventories current data; an explicit migration imports into this model.
-- Requires SQLite with JSON functions, FTS5, and the published WAL-reset fix.

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL,
  app_build TEXT NOT NULL
);
CREATE TABLE assistants (
  assistant_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
  persona_version INTEGER NOT NULL DEFAULT 1 CHECK(persona_version > 0),
  erase_epoch INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE persona_versions (
  assistant_id TEXT NOT NULL REFERENCES assistants, revision INTEGER NOT NULL,
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  source_ref_json TEXT CHECK(source_ref_json IS NULL OR json_valid(source_ref_json)),
  created_at TEXT NOT NULL, PRIMARY KEY(assistant_id,revision)
);
CREATE TABLE preferences (
  assistant_id TEXT NOT NULL REFERENCES assistants, scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL, preference_key TEXT NOT NULL, revision INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  source_ref_json TEXT CHECK(source_ref_json IS NULL OR json_valid(source_ref_json)),
  updated_at TEXT NOT NULL, PRIMARY KEY(assistant_id,scope_type,scope_id,preference_key),
  CHECK(scope_type IN ('assistant','project','session'))
);
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  name TEXT NOT NULL, workspace_path TEXT, archived_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  project_id TEXT REFERENCES projects, kind TEXT NOT NULL CHECK(kind IN ('user','internal')),
  title TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE branches (
  branch_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions,
  parent_branch_id TEXT REFERENCES branches, active_leaf_id TEXT,
  canonical_revision INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 1,
  lease_run_id TEXT, lease_token INTEGER NOT NULL DEFAULT 0, lease_until TEXT,
  created_at TEXT NOT NULL, UNIQUE(session_id,branch_id)
);
CREATE TABLE pi_sessions (
  session_id TEXT PRIMARY KEY REFERENCES sessions, sdk_version TEXT NOT NULL,
  sdk_build TEXT NOT NULL, entry_format_version TEXT NOT NULL,
  header_json TEXT NOT NULL CHECK(json_valid(header_json)), config_fingerprint TEXT NOT NULL
);
CREATE TABLE pi_entries (
  session_id TEXT NOT NULL REFERENCES pi_sessions, entry_id TEXT NOT NULL,
  parent_id TEXT, entry_type TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_hash TEXT NOT NULL, committed_seq INTEGER NOT NULL, entry_ordinal INTEGER NOT NULL,
  erased_at TEXT, PRIMARY KEY(session_id,entry_id), UNIQUE(session_id,entry_ordinal),
  FOREIGN KEY(session_id,parent_id) REFERENCES pi_entries(session_id,entry_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX pi_entries_parent ON pi_entries(session_id,parent_id);
CREATE TABLE messages (
  message_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions,
  branch_id TEXT NOT NULL REFERENCES branches, run_id TEXT,
  entry_id TEXT, role TEXT NOT NULL CHECK(role IN ('user','assistant','tool','system')),
  content_json TEXT NOT NULL CHECK(json_valid(content_json)), revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, erased_at TEXT, UNIQUE(session_id,entry_id)
);
CREATE INDEX messages_timeline ON messages(branch_id,created_at,message_id);
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  session_id TEXT NOT NULL, branch_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('user','proactive','consolidation','scheduled','child','recovery')),
  origin_session_id TEXT REFERENCES sessions, parent_run_id TEXT REFERENCES runs,
  recovery_of_run_id TEXT REFERENCES runs, lane TEXT NOT NULL CHECK(lane IN ('foreground','background')),
  state TEXT NOT NULL CHECK(state IN ('queued','starting','running','waiting_approval','waiting_input','cancelling','succeeded','failed','cancelled','interrupted')),
  phase TEXT NOT NULL CHECK(phase IN ('idle','thinking','tool','compacting')),
  revision INTEGER NOT NULL DEFAULT 1, current_attempt_id TEXT,
  scope_json TEXT NOT NULL CHECK(json_valid(scope_json)), budget_json TEXT NOT NULL CHECK(json_valid(budget_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, terminal_reason TEXT,
  FOREIGN KEY(session_id,branch_id) REFERENCES branches(session_id,branch_id)
);
CREATE UNIQUE INDEX one_active_writer_per_branch ON runs(branch_id)
  WHERE state IN ('starting','running','waiting_approval','waiting_input','cancelling');
CREATE INDEX runs_queue ON runs(lane,state,created_at);
CREATE TABLE run_attempts (
  attempt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs, attempt_no INTEGER NOT NULL,
  worker_id TEXT NOT NULL, worker_epoch INTEGER NOT NULL, lease_token INTEGER NOT NULL,
  start_revision INTEGER NOT NULL, end_revision INTEGER,
  state TEXT NOT NULL CHECK(state IN ('starting','running','settled','failed','interrupted')),
  config_fingerprint TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
  UNIQUE(run_id,attempt_no)
);
CREATE TABLE checkpoint_receipts (
  attempt_id TEXT NOT NULL REFERENCES run_attempts, batch_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, ack_json TEXT NOT NULL CHECK(json_valid(ack_json)),
  committed_seq INTEGER NOT NULL, committed_at TEXT NOT NULL,
  PRIMARY KEY(attempt_id,batch_id)
);
CREATE TABLE run_inputs (
  input_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs,
  message_id TEXT NOT NULL REFERENCES messages,
  mode TEXT NOT NULL CHECK(mode IN ('initial','steer','follow_up')),
  state TEXT NOT NULL CHECK(state IN ('queued','consumed','cancelled')),
  created_at TEXT NOT NULL, consumed_at TEXT, UNIQUE(run_id,message_id)
);
CREATE TABLE command_receipts (
  command_id TEXT PRIMARY KEY, actor TEXT NOT NULL, command_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  committed_seq INTEGER NOT NULL, committed_at TEXT NOT NULL
);
CREATE TABLE domain_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
  assistant_id TEXT NOT NULL REFERENCES assistants, event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, aggregate_revision INTEGER NOT NULL,
  occurred_at TEXT NOT NULL, committed_at TEXT NOT NULL,
  causation_id TEXT, correlation_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('assistant','project','session')), scope_id TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(source_refs_json)),
  payload_version INTEGER NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  redacted_at TEXT
);
CREATE INDEX domain_events_aggregate ON domain_events(aggregate_type,aggregate_id,aggregate_revision);
CREATE INDEX domain_events_scope ON domain_events(assistant_id,scope_type,scope_id,seq);
CREATE TABLE outbox (
  outbox_id TEXT PRIMARY KEY, event_id TEXT REFERENCES domain_events(event_id),
  kind TEXT NOT NULL, consumer_id TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  state TEXT NOT NULL CHECK(state IN ('pending','leased','delivered','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL,
  lease_owner TEXT, lease_until TEXT, fencing_token INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, last_error_code TEXT
);
CREATE INDEX outbox_ready ON outbox(state,next_attempt_at);
CREATE TABLE consumer_receipts (
  consumer_id TEXT NOT NULL, event_id TEXT NOT NULL REFERENCES domain_events(event_id),
  processed_at TEXT NOT NULL, PRIMARY KEY(consumer_id,event_id)
);
CREATE TABLE tool_invocations (
  invocation_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs,
  attempt_id TEXT NOT NULL REFERENCES run_attempts, parent_invocation_id TEXT REFERENCES tool_invocations,
  pi_tool_call_id TEXT NOT NULL, tool_id TEXT NOT NULL, tool_version TEXT NOT NULL,
  final_args_json TEXT NOT NULL CHECK(json_valid(final_args_json)), final_args_hash TEXT NOT NULL,
  resource_versions_json TEXT NOT NULL CHECK(json_valid(resource_versions_json)),
  effect_class TEXT NOT NULL CHECK(effect_class IN ('read','local_write','external_write')),
  state TEXT NOT NULL CHECK(state IN ('planned','awaiting_approval','executing','succeeded','failed','cancelled','denied','outcome_unknown')),
  idempotency_key TEXT NOT NULL UNIQUE, result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  result_hash TEXT, created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT,
  UNIQUE(attempt_id,pi_tool_call_id)
);
CREATE TABLE approvals (
  approval_id TEXT PRIMARY KEY, invocation_id TEXT NOT NULL REFERENCES tool_invocations,
  revision INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL CHECK(status IN ('pending','approved','denied','expired','invalidated')),
  final_args_hash TEXT NOT NULL, policy_revision INTEGER NOT NULL,
  resource_versions_json TEXT NOT NULL CHECK(json_valid(resource_versions_json)),
  title TEXT NOT NULL, description TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, resolved_at TEXT
);
CREATE INDEX approvals_pending ON approvals(status,expires_at);
CREATE TABLE blobs (
  blob_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length>=0),
  assistant_id TEXT NOT NULL REFERENCES assistants, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('available','erased','gc_pending')), created_at TEXT NOT NULL
);
CREATE TABLE derivations (
  source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_revision INTEGER NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, target_revision INTEGER NOT NULL,
  PRIMARY KEY(source_type,source_id,source_revision,target_type,target_id,target_revision)
);
CREATE INDEX derivations_reverse ON derivations(target_type,target_id,target_revision);
CREATE TABLE scope_epochs (
  assistant_id TEXT NOT NULL REFERENCES assistants, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0, erase_epoch INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(assistant_id,scope_type,scope_id)
);
CREATE TABLE erasure_rules (
  rule_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  scope_type TEXT NOT NULL, scope_id TEXT NOT NULL, source_type TEXT NOT NULL,
  source_id TEXT NOT NULL, source_revision INTEGER, erase_epoch INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('forget_memory','erase_payload')),
  created_at TEXT NOT NULL, UNIQUE(assistant_id,source_type,source_id,mode)
);
CREATE TABLE memory_slots (
  assistant_id TEXT NOT NULL REFERENCES assistants, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
  subject_id TEXT NOT NULL, slot_key TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
  preferred_memory_id TEXT, conflict_group_id TEXT,
  PRIMARY KEY(assistant_id,scope_type,scope_id,subject_id,slot_key)
);
CREATE TABLE memories (
  memory_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('assistant','project','session')), scope_id TEXT NOT NULL,
  subject_id TEXT NOT NULL, slot_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('preference','fact','decision','procedure','episode')),
  current_revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('candidate','active','disputed','superseded','expired','erased')),
  conflict_group_id TEXT, valid_from TEXT NOT NULL, valid_until TEXT,
  erase_epoch INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX memories_scope ON memories(assistant_id,scope_type,scope_id,status,valid_until);
CREATE INDEX memories_slot ON memories(assistant_id,scope_type,scope_id,subject_id,slot_key);
CREATE TABLE memory_revisions (
  memory_id TEXT NOT NULL REFERENCES memories, revision INTEGER NOT NULL,
  content TEXT, content_hash TEXT NOT NULL,
  source_class TEXT NOT NULL CHECK(source_class IN ('explicit_user','observed_receipt','imported_claim','model_inference')),
  certainty TEXT NOT NULL CHECK(certainty IN ('asserted','corroborated','uncertain')),
  valid_from TEXT NOT NULL, valid_until TEXT, recorded_at TEXT NOT NULL,
  last_verified_at TEXT, supersedes_memory_id TEXT, supersedes_revision INTEGER,
  erased_at TEXT, PRIMARY KEY(memory_id,revision)
);
CREATE TABLE memory_provenance (
  memory_id TEXT NOT NULL, memory_revision INTEGER NOT NULL,
  source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_revision INTEGER NOT NULL,
  source_hash TEXT NOT NULL, source_actor TEXT NOT NULL,
  span_start INTEGER NOT NULL DEFAULT 0, span_end INTEGER NOT NULL DEFAULT 0,
  CHECK(span_start>=0 AND span_end>=span_start),
  PRIMARY KEY(memory_id,memory_revision,source_type,source_id,source_revision,span_start,span_end),
  FOREIGN KEY(memory_id,memory_revision) REFERENCES memory_revisions(memory_id,revision)
);
CREATE INDEX memory_provenance_source ON memory_provenance(source_type,source_id,source_revision);
CREATE TABLE memory_relations (
  from_id TEXT NOT NULL REFERENCES memories, from_revision INTEGER NOT NULL,
  relation TEXT NOT NULL CHECK(relation IN ('supersedes','conflicts','derived_from','same_subject')),
  to_id TEXT NOT NULL REFERENCES memories, to_revision INTEGER NOT NULL,
  PRIMARY KEY(from_id,from_revision,relation,to_id,to_revision)
);
CREATE TABLE memory_proposals (
  proposal_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  idempotency_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  status TEXT NOT NULL CHECK(status IN ('pending','published','rejected','conflict')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)), created_at TEXT NOT NULL
);
CREATE TABLE memory_search (
  search_id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL UNIQUE REFERENCES memories, revision INTEGER NOT NULL,
  search_tokens TEXT NOT NULL, tokenizer_version TEXT NOT NULL
);
CREATE VIRTUAL TABLE memory_fts USING fts5(search_tokens,content='memory_search',content_rowid='search_id',tokenize='unicode61');
CREATE TRIGGER memory_search_ai AFTER INSERT ON memory_search BEGIN
  INSERT INTO memory_fts(rowid,search_tokens) VALUES(new.search_id,new.search_tokens);
END;
CREATE TRIGGER memory_search_ad AFTER DELETE ON memory_search BEGIN
  INSERT INTO memory_fts(memory_fts,rowid,search_tokens) VALUES('delete',old.search_id,old.search_tokens);
END;
CREATE TRIGGER memory_search_au AFTER UPDATE ON memory_search BEGIN
  INSERT INTO memory_fts(memory_fts,rowid,search_tokens) VALUES('delete',old.search_id,old.search_tokens);
  INSERT INTO memory_fts(rowid,search_tokens) VALUES(new.search_id,new.search_tokens);
END;
CREATE TABLE embeddings (
  memory_id TEXT NOT NULL, memory_revision INTEGER NOT NULL,
  encoder_id TEXT NOT NULL, encoder_revision TEXT NOT NULL, dimension INTEGER NOT NULL CHECK(dimension>0),
  vector BLOB, external_ref TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(memory_id,memory_revision,encoder_id,encoder_revision),
  FOREIGN KEY(memory_id,memory_revision) REFERENCES memory_revisions(memory_id,revision),
  CHECK((vector IS NOT NULL) != (external_ref IS NOT NULL))
);
CREATE TABLE context_snapshots (
  snapshot_id TEXT PRIMARY KEY, branch_id TEXT NOT NULL REFERENCES branches,
  revision INTEGER NOT NULL, branch_generation INTEGER NOT NULL,
  cut_seq INTEGER NOT NULL, source_prefix_hash TEXT NOT NULL, erase_epoch INTEGER NOT NULL,
  source_entries_json TEXT NOT NULL CHECK(json_valid(source_entries_json)),
  compaction_entry_id TEXT NOT NULL, safe_cut_token_id TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  canonical_revision INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('valid','invalidated','erased')),
  created_at TEXT NOT NULL, UNIQUE(branch_id,revision)
);
CREATE TABLE context_manifests (
  manifest_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs,
  attempt_id TEXT NOT NULL REFERENCES run_attempts, packet_hash TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)), created_at TEXT NOT NULL, erased_at TEXT
);
CREATE TABLE model_requests (
  provider_request_id TEXT PRIMARY KEY, permit_id TEXT NOT NULL UNIQUE, permit_expires_at TEXT NOT NULL,
  request_kind TEXT NOT NULL, usage_source TEXT, attempt_id TEXT NOT NULL REFERENCES run_attempts,
  manifest_id TEXT NOT NULL REFERENCES context_manifests, retry_index INTEGER NOT NULL DEFAULT 0,
  requested_model TEXT NOT NULL, actual_model TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed','cancelled','unknown')),
  input_tokens INTEGER, output_tokens INTEGER, cost_json TEXT,
  started_at TEXT NOT NULL, ended_at TEXT, error_code TEXT
);
CREATE TABLE memory_eligible_events (
  eligible_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  assistant_id TEXT NOT NULL REFERENCES assistants, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL REFERENCES domain_events(event_id), source_revision INTEGER NOT NULL,
  source_hash TEXT NOT NULL, eligible_at TEXT NOT NULL,
  UNIQUE(assistant_id,scope_type,scope_id,source_event_id,source_revision)
);
CREATE INDEX eligible_scope ON memory_eligible_events(assistant_id,scope_type,scope_id,eligible_seq);
CREATE TABLE consolidation_cursors (
  assistant_id TEXT NOT NULL REFERENCES assistants, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL, last_eligible_seq INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(assistant_id,scope_type,scope_id,extractor_version)
);
CREATE TABLE consolidation_jobs (
  job_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
  from_eligible_seq INTEGER NOT NULL, to_eligible_seq INTEGER NOT NULL,
  input_hash TEXT NOT NULL, extractor_version TEXT NOT NULL, base_cursor_revision INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled')),
  lease_owner TEXT, lease_until TEXT, fencing_token INTEGER NOT NULL DEFAULT 0,
  erase_epoch INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_active_consolidation_scope
  ON consolidation_jobs(assistant_id,scope_type,scope_id,extractor_version) WHERE state='running';
CREATE TABLE consolidation_results (
  job_id TEXT NOT NULL REFERENCES consolidation_jobs, eligible_seq INTEGER NOT NULL REFERENCES memory_eligible_events,
  disposition TEXT NOT NULL CHECK(disposition IN ('published','rejected','no_candidate','already_processed')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)), PRIMARY KEY(job_id,eligible_seq)
);
CREATE TABLE planner_items (
  item_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants, project_id TEXT REFERENCES projects,
  kind TEXT NOT NULL CHECK(kind IN ('note','task','calendar_event')),
  status TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1, due_date TEXT, due_at TEXT, timezone TEXT,
  completed_at TEXT, completion_source_json TEXT, source_refs_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(due_date IS NULL OR due_at IS NULL),
  CHECK((kind='note' AND status IN ('active','archived')) OR
        (kind='task' AND status IN ('todo','doing','done','cancelled')) OR
        (kind='calendar_event' AND status IN ('scheduled','cancelled'))),
  CHECK(status!='done' OR completed_at IS NOT NULL)
);
CREATE INDEX planner_view ON planner_items(assistant_id,project_id,kind,status,due_at,due_date);
CREATE TABLE schedule_blocks (
  block_id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES planner_items,
  revision INTEGER NOT NULL DEFAULT 1, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  timezone TEXT NOT NULL, time_binding TEXT NOT NULL CHECK(time_binding IN ('floating_local','zoned_local','absolute_instant')),
  all_day INTEGER NOT NULL CHECK(all_day IN (0,1)), local_start TEXT, local_end TEXT,
  locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)), estimate_source TEXT,
  CHECK(length(start_at)=24 AND length(end_at)=24 AND end_at>start_at),
  CHECK((all_day=0 AND time_binding='absolute_instant') OR (local_start IS NOT NULL AND local_end IS NOT NULL))
);
CREATE INDEX schedule_range ON schedule_blocks(start_at,end_at);
CREATE TABLE plan_drafts (
  draft_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  revision INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL CHECK(state IN ('draft','committed','discarded')),
  affected_versions_json TEXT NOT NULL CHECK(json_valid(affected_versions_json)),
  affected_ranges_json TEXT NOT NULL CHECK(json_valid(affected_ranges_json)),
  changes_json TEXT NOT NULL CHECK(json_valid(changes_json)), source_refs_json TEXT NOT NULL,
  unresolved_estimates_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE reminder_rules (
  rule_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants, item_id TEXT REFERENCES planner_items,
  revision INTEGER NOT NULL DEFAULT 1, rule_json TEXT NOT NULL CHECK(json_valid(rule_json)),
  timezone TEXT NOT NULL, time_binding TEXT NOT NULL CHECK(time_binding IN ('floating_local','zoned_local','absolute_instant')),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), next_fire_at TEXT,
  catch_up TEXT NOT NULL CHECK(catch_up IN ('within_grace','current_day_once','skip')),
  grace_seconds INTEGER NOT NULL CHECK(grace_seconds>=0)
);
CREATE TABLE schedule_occurrences (
  occurrence_id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES reminder_rules,
  rule_revision INTEGER NOT NULL, recurrence_key TEXT NOT NULL, scheduled_at TEXT NOT NULL,
  snooze_until TEXT, snooze_generation INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL CHECK(state IN ('pending','claimed','fired','skipped')),
  lease_until TEXT, fencing_token INTEGER NOT NULL DEFAULT 0,
  fired_at TEXT, UNIQUE(rule_id,recurrence_key)
);
CREATE INDEX occurrences_due ON schedule_occurrences(state,scheduled_at,snooze_until);
CREATE TABLE terminal_sessions (
  terminal_session_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  executor_kind TEXT NOT NULL CHECK(executor_kind IN ('codex','opencode','terminal')),
  adapter_version TEXT NOT NULL, executor_version TEXT, external_session_id TEXT, cwd TEXT NOT NULL,
  process_ownership TEXT NOT NULL CHECK(process_ownership IN ('chela','external')),
  process_state TEXT NOT NULL CHECK(process_state IN ('starting','running','exited','interrupted')),
  capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json)),
  last_result_ref TEXT, output_blob_id TEXT REFERENCES blobs, created_at TEXT NOT NULL, ended_at TEXT
);
CREATE TABLE execution_links (
  link_id TEXT PRIMARY KEY, item_id TEXT REFERENCES planner_items,
  run_id TEXT REFERENCES runs, terminal_session_id TEXT REFERENCES terminal_sessions,
  created_at TEXT NOT NULL, CHECK((run_id IS NOT NULL) != (terminal_session_id IS NOT NULL))
);
CREATE TABLE execution_observations (
  observation_id TEXT PRIMARY KEY, terminal_session_id TEXT NOT NULL REFERENCES terminal_sessions,
  source_event_key TEXT NOT NULL, evidence_format TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('process_exit','reply_available','input_required','failed','reply_seen','handled')),
  result_ref TEXT, result_version INTEGER, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  observed_at TEXT NOT NULL, UNIQUE(terminal_session_id,source_event_key)
);
CREATE TABLE attention_items (
  attention_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  scope_type TEXT NOT NULL, scope_id TEXT NOT NULL, origin_session_id TEXT REFERENCES sessions,
  revision INTEGER NOT NULL DEFAULT 1, goal TEXT NOT NULL,
  condition_json TEXT NOT NULL CHECK(json_valid(condition_json)), source_refs_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('candidate','active','waiting','resolved','cancelled','expired')),
  priority INTEGER NOT NULL, next_review_at TEXT NOT NULL, expires_at TEXT,
  last_evaluated_event_seq INTEGER, last_fact_fingerprint TEXT, resolution_reason TEXT
);
CREATE INDEX attention_due ON attention_items(assistant_id,state,next_review_at);
CREATE TABLE intentions (
  intention_id TEXT PRIMARY KEY, attention_id TEXT REFERENCES attention_items,
  attention_revision INTEGER, assistant_id TEXT NOT NULL REFERENCES assistants,
  kind TEXT NOT NULL CHECK(kind IN ('silent_update','read_more','suggest','notify','prepare_draft')),
  state TEXT NOT NULL CHECK(state IN ('proposed','eligible','deferred','acted','revoked','expired')),
  reason TEXT NOT NULL, evidence_refs_json TEXT NOT NULL,
  proposal_json TEXT NOT NULL CHECK(json_valid(proposal_json)), expires_at TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE deliveries (
  delivery_id TEXT PRIMARY KEY, intention_id TEXT NOT NULL REFERENCES intentions,
  assistant_id TEXT NOT NULL REFERENCES assistants, revision INTEGER NOT NULL DEFAULT 1,
  fact_key TEXT NOT NULL, fact_version TEXT NOT NULL, purpose TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','deferred','presented','seen','dismissed','revoked','expired')),
  surface TEXT NOT NULL CHECK(surface IN ('pet','workspace','system_notification')),
  text TEXT NOT NULL, actions_json TEXT NOT NULL CHECK(json_valid(actions_json)), source_refs_json TEXT NOT NULL,
  not_before TEXT NOT NULL, expires_at TEXT NOT NULL, delivered_at TEXT, seen_at TEXT, dismissed_at TEXT,
  UNIQUE(assistant_id,fact_key,fact_version,purpose)
);
CREATE INDEX deliveries_due ON deliveries(status,not_before,expires_at);
CREATE TABLE affect_state (
  assistant_id TEXT PRIMARY KEY REFERENCES assistants, revision INTEGER NOT NULL DEFAULT 0,
  config_version INTEGER NOT NULL, scores_json TEXT NOT NULL CHECK(json_valid(scores_json)),
  calculated_at TEXT NOT NULL, last_accepted_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE affect_events (
  accepted_seq INTEGER PRIMARY KEY AUTOINCREMENT, assistant_id TEXT NOT NULL REFERENCES assistants,
  cause_event_id TEXT NOT NULL REFERENCES domain_events(event_id), source_event_seq INTEGER NOT NULL,
  appraisal_kind TEXT NOT NULL, persona_version INTEGER NOT NULL,
  proposal_json TEXT NOT NULL CHECK(json_valid(proposal_json)),
  applied_delta_json TEXT CHECK(applied_delta_json IS NULL OR json_valid(applied_delta_json)),
  applied_revision INTEGER, accepted_at TEXT NOT NULL, applied_at TEXT,
  UNIQUE(assistant_id,cause_event_id,appraisal_kind)
);
CREATE TABLE daily_reports (
  report_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  local_date TEXT NOT NULL, timezone TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  fact_snapshot_json TEXT NOT NULL CHECK(json_valid(fact_snapshot_json)),
  generated_text TEXT, delivery_id TEXT REFERENCES deliveries, updated_at TEXT NOT NULL,
  UNIQUE(assistant_id,local_date,timezone)
);
CREATE TABLE capability_installations (
  capability_id TEXT PRIMARY KEY, version TEXT NOT NULL, build_hash TEXT NOT NULL,
  trust TEXT NOT NULL CHECK(trust IN ('managed','trusted-native','external-executor')),
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), health TEXT NOT NULL, installed_at TEXT NOT NULL
);
CREATE TABLE model_catalog_snapshots (
  catalog_version TEXT PRIMARY KEY, etag TEXT, source TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), fetched_at TEXT NOT NULL
);
CREATE TABLE role_bindings (
  assistant_id TEXT NOT NULL REFERENCES assistants, role TEXT NOT NULL,
  model_ref TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  fallback_policy_json TEXT NOT NULL CHECK(json_valid(fallback_policy_json)),
  PRIMARY KEY(assistant_id,role)
);
CREATE TABLE background_jobs (
  job_id TEXT PRIMARY KEY, kind TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled')),
  next_attempt_at TEXT NOT NULL, lease_owner TEXT, lease_until TEXT,
  fencing_token INTEGER NOT NULL DEFAULT 0, attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE legacy_import_map (
  source_system TEXT NOT NULL, source_id TEXT NOT NULL, source_hash TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, imported_at TEXT NOT NULL,
  PRIMARY KEY(source_system,source_id,target_type)
);
