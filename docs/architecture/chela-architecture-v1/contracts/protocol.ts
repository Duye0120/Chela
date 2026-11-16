/** Chela v1 contract specification. Types only; not an implemented application.
 * Wire envelope is checked by wire.schema.json. Payload validators must be
 * generated/implemented from this contract and tested in both Go and TS.
 * Raw Pi entry payloads preserve unknown upstream fields.
 */
export type ID = string;
export type Seq = string; // unsigned decimal SQLite sequence; never JS Number
export type UTC = string; // normalized UTC YYYY-MM-DDTHH:mm:ss.sssZ; exactly 24 characters
export type LocalDate = string; // YYYY-MM-DD
export type Revision = number; // integer 0..Number.MAX_SAFE_INTEGER
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Obj = { [key: string]: Json };
export type Scope =
  | { type: "assistant"; id: ID }
  | { type: "project"; id: ID }
  | { type: "session"; id: ID };
export interface VersionRef { id: ID; revision: Revision; }
export interface SourceRef {
  source_type: "message" | "tool_result" | "planner_item" | "document" | "execution_result" | "setting" | "event";
  source_id: ID;
  source_revision: Revision;
  payload_hash: string;
  span?: { start_utf8: number; end_utf8: number }; // half-open range
  scope: Scope;
}
export interface BlobRef {
  blob_id: ID; sha256: string; byte_length: number; mime_type: string;
}
export interface ContextIds {
  assistant_id: ID; session_id: ID; branch_id: ID; run_id: ID; attempt_id: ID;
}
export interface GrantRef { grant_id: ID; revision: Revision; }
export interface RunScope {
  scope_id: ID;
  revision: Revision;
  visible_scopes: Scope[];
  allowed_source_ids: ID[];
  grants: GrantRef[];
  output_targets: string[];
  workspace_id?: ID;
  scope_epochs: { scope: Scope; epoch: number }[];
  erase_epoch: number;
}
export interface Budget {
  max_input_tokens: number; max_output_tokens: number;
  max_model_requests: number; max_tool_calls: number;
  deadline_at: UTC; cost_ceiling?: { currency: string; amount: string };
}
export type RunState = "queued" | "starting" | "running" | "waiting_approval" |
  "waiting_input" | "cancelling" | "succeeded" | "failed" | "cancelled" | "interrupted";
export type RunPhase = "idle" | "thinking" | "tool" | "compacting";
export type RunOrigin = "user" | "proactive" | "consolidation" | "scheduled" | "child" | "recovery";
export interface RunSnapshot {
  run_id: ID; assistant_id: ID; session_id: ID; branch_id: ID;
  origin: RunOrigin; origin_session_id?: ID; parent_run_id?: ID; recovery_of_run_id?: ID;
  lane: "foreground" | "background"; state: RunState; phase: RunPhase;
  revision: Revision; current_attempt_id?: ID; scope: RunScope; budget: Budget;
  created_at: UTC; updated_at: UTC; terminal_reason?: string;
}
export interface DomainError {
  code: "INVALID_ARGUMENT" | "REVISION_CONFLICT" | "IDEMPOTENCY_CONFLICT" |
    "SCOPE_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_EXPIRED" | "CANCELLED" |
    "DEADLINE_EXCEEDED" | "CAPACITY_EXHAUSTED" | "MODEL_UNAVAILABLE" |
    "CONTEXT_TOO_LARGE" | "PROTOCOL_MISMATCH" | "STALE_EPOCH" | "STALE_LEASE" |
    "OUTCOME_UNKNOWN" | "CURSOR_EXPIRED" | "STORAGE_UNAVAILABLE" | "DELEGATION_CAPACITY";
  message: string; retryable: boolean; correlation_id: ID;
  retry_after_ms?: number; details_ref?: ID;
}
export interface Command<T> {
  command_id: ID; actor: "user" | "system" | "pi";
  expected_revision?: Revision; payload: T;
}
export type CommandResult<T> = { ok: true; result: T; event_cursor: Seq } |
  { ok: false; error: DomainError };
export interface DomainEvent<T extends Json = Json> {
  event_id: ID; seq: Seq; event_type: string;
  aggregate_type: string; aggregate_id: ID; aggregate_revision: Revision;
  occurred_at: UTC; committed_at: UTC; assistant_id: ID; scope: Scope;
  causation_id?: ID; correlation_id: ID; source_refs: SourceRef[];
  payload_version: number; payload: T;
}
export interface ContentBlock {
  type: "text" | "image" | "attachment";
  text?: string; blob?: BlobRef;
}
export interface SubmitMessage {
  assistant_id: ID; session_id: ID; branch_id: ID;
  expected_branch_generation: number;
  observed_branch_revision?: Revision; // stale append-only head is not a permission change
  content: ContentBlock[];
  on_busy: "queue_follow_up" | "steer" | "reject";
  model_role?: ModelRole;
}
export interface SubmitReceipt { message_id: ID; run_id: ID; state: RunState; }
export interface CancelRun { run_id: ID; reason: "user" | "shutdown" | "deadline" | "erasure"; }
export interface RecoverRun {
  interrupted_run_id: ID;
  expected_revision: Revision;
  recovery_policy: "recheck_and_continue"; // new Run, new policy evaluation
}
export interface ApprovalDecision {
  approval_id: ID; expected_revision: Revision;
  decision: "approve_once" | "deny";
  final_args_hash: string; policy_revision: Revision;
}
export interface Snapshot<T> { data: T; snapshot_cursor: Seq; schema_version: number; }

// Pi projection and persistence barrier.
export interface PiEntryRecord {
  entry_id: string; parent_id: string | null; entry_type: string;
  payload: Obj; payload_hash: string;
}
export interface PersistedPiEntry extends PiEntryRecord { entry_ordinal: Seq; }
export interface PiSessionImage {
  sdk_version: string; sdk_build: string; entry_format_version: string;
  header: Obj; entries: PersistedPiEntry[]; active_leaf_id: string | null;
  canonical_revision: Revision; branch_generation: number;
}
export interface AttemptLease {
  attempt_id: ID; run_id: ID; branch_id: ID; branch_generation: number;
  lease_token: number; worker_id: ID; epoch: number; expires_at: UTC;
}
export interface CheckpointRequest {
  base_revision: Revision; branch_generation: number; lease_token: number;
  erase_epoch: number; active_leaf_id: string | null;
  added_entries: PiEntryRecord[]; // ordered batch; Go assigns session-wide entry_ordinal in transaction
  boundary: "factory" | "message" | "tool_batch" | "metadata" | "settled";
  batch_id: ID;
}
export interface CheckpointAck {
  batch_id: ID; canonical_revision: Revision; committed_seq: Seq;
  active_leaf_id: string | null;
}
export interface SafeCutRequest {
  branch_id: ID; branch_generation: number; base_snapshot_revision: Revision;
  source_entry_ids: string[]; source_prefix_hash: string;
  cut_seq: Seq; erase_epoch: number; complete_tool_group_ids: ID[];
}
export interface WorkSnapshot {
  goals: { text: string; sources: SourceRef[] }[];
  decisions: { text: string; sources: SourceRef[] }[];
  open_questions: { text: string; sources: SourceRef[] }[];
  next_actions: { text: string; sources: SourceRef[] }[];
  important_refs: SourceRef[];
  // Task completion and approval facts are fetched from canonical domain tables.
}
export interface CompactionCommit {
  checkpoint: Omit<CheckpointRequest, "boundary">;
  safe_cut_request: SafeCutRequest;
  snapshot: WorkSnapshot;
  compaction_entry_id: string;
}
export interface ContextRepairCommit {
  checkpoint: Omit<CheckpointRequest, "boundary">;
  repair_kind: "omit_failed_provider_attempt";
  failed_provider_request_ids: ID[]; affected_entry_ids: string[]; source_prefix_hash: string;
  // Go permits only proven failed model attempts; no user input, successful
  // tool result, pending approval, or unknown side effect may be hidden.
}
export interface SafeCutToken {
  token_id: ID; branch_id: ID; branch_generation: number;
  snapshot_id: ID; snapshot_revision: Revision; cut_seq: Seq;
  source_prefix_hash: string; erase_epoch: number;
  compaction_entry_id: string; canonical_revision: Revision; committed_seq: Seq;
}
export interface ContextManifest {
  manifest_id: ID; context: ContextIds; branch_generation: number;
  head_seq: Seq; persona_version: Revision; affect_version: Revision;
  memory_versions: VersionRef[]; setting_versions: VersionRef[];
  scope: RunScope; source_refs: SourceRef[]; snapshot_id?: ID;
  tool_catalog_hash: string; model_ref: string; input_estimated_tokens: number;
  output_reserve: number; guard_tokens: number; margin_tokens: number;
  packet_hash: string; created_at: UTC;
}

export interface ModelRequestPrepare {
  provider_request_id: ID; retry_index: number;
  request_kind: "turn" | "compaction" | "retry" | "memory" | "proactive";
  lease: AttemptLease; canonical_revision: Revision;
  manifest: ContextManifest; final_packet_ref: BlobRef;
  requested_model_ref: string; packet_hash: string;
}
export interface ModelPermit {
  permit_id: ID; provider_request_id: ID; manifest_id: ID;
  route: ResolvedModel; expires_at: UTC;
  max_output_tokens: number;
  ephemeral_auth?: Obj; // private IPC only; never in durable receipts, manifests or logs
}
export interface ModelRequestFinish {
  permit_id: ID; provider_request_id: ID;
  outcome: "succeeded" | "failed" | "cancelled" | "unknown";
  actual_model_ref: string; input_tokens?: number; output_tokens?: number;
  usage_source: "provider" | "estimated" | "unknown";
  error?: DomainError;
}

// Tool gateway: exact final arguments are revalidated and hashed by Go.
export type InvocationState = "planned" | "awaiting_approval" | "executing" |
  "succeeded" | "failed" | "cancelled" | "denied" | "outcome_unknown";
export interface ToolRequest {
  invocation_id: ID; parent_invocation_id?: ID; pi_tool_call_id: string;
  tool_id: string; tool_version: string; args: Obj;
  required_checkpoint: CheckpointAck;
  lease_token: number; expected_resource_versions: VersionRef[];
  effect_class: "read" | "local_write" | "external_write"; // hint only; Go recomputes from trusted registry and final args
  timeout_ms: number;
}
export interface ToolResult {
  invocation_id: ID; state: "succeeded" | "failed" | "cancelled" | "denied" | "outcome_unknown";
  summary: string; content?: Json; artifact_refs: BlobRef[];
  receipt_refs: SourceRef[]; result_hash: string;
  error?: DomainError;
}
export interface ApprovalSnapshot {
  approval_id: ID; revision: Revision; invocation_id: ID; run_id: ID;
  status: "pending" | "approved" | "denied" | "expired" | "invalidated";
  final_args_hash: string; policy_revision: Revision; resource_versions: VersionRef[];
  title: string; description: string; expires_at: UTC;
}

// Long-term memory, distinct from tasks, mood and working snapshots.
export type MemoryKind = "preference" | "fact" | "decision" | "procedure" | "episode";
export type MemoryStatus = "candidate" | "active" | "disputed" | "superseded" | "expired" | "erased";
export interface MemoryProposal {
  proposal_id: ID; operation: "create" | "revise" | "supersede" | "dispute";
  memory_id?: ID; expected_revision?: Revision; expected_slot_revision: Revision;
  assistant_id: ID; scope: Scope; subject_id: ID; slot_key: string;
  kind: MemoryKind; content: string; source_refs: SourceRef[];
  source_class: "explicit_user" | "observed_receipt" | "imported_claim" | "model_inference";
  certainty: "asserted" | "corroborated" | "uncertain";
  valid_from: UTC; valid_until?: UTC; erase_epoch: number;
  supersedes?: VersionRef;
}
export interface EvidenceItem {
  memory: VersionRef; kind: MemoryKind; status: MemoryStatus;
  text: string; scope: Scope; sources: SourceRef[];
  valid_from: UTC; valid_until?: UTC; conflict_group_id?: ID;
  retrieval_reason: "exact" | "lexical" | "vector" | "mixed";
}
export interface EvidenceBundle {
  query_id: ID; scope: RunScope; items: EvidenceItem[];
  estimated_tokens: number; degraded_paths: string[];
}
export interface ConsolidationLease {
  job_id: ID; scope: Scope; from_eligible_seq: Seq; to_eligible_seq: Seq;
  input_hash: string; extractor_version: string; cursor_revision: Revision;
  lease_owner: ID; lease_until: UTC; fencing_token: number; erase_epoch: number;
}

// Planner: due dates, allocated time and reminders are independent.
export type TimeBinding = "floating_local" | "zoned_local" | "absolute_instant";
export type Deadline = ({ due_date: LocalDate; due_at?: never } | { due_at: UTC; due_date?: never }) & { timezone: string };
export interface PlannerItemBase {
  item_id: ID; assistant_id: ID; project_id?: ID; revision: Revision;
  title: string; description?: string; sources: SourceRef[];
  metadata?: Obj; // legacy note URL / optional acceptance and result; not a mandatory workflow
}
export type PlannerItem = PlannerItemBase & (
  | { kind: "note"; status: "active" | "archived" }
  | { kind: "task"; status: "todo" | "doing" | "done" | "cancelled";
      deadline?: Deadline; completed_at?: UTC; completion_source?: SourceRef }
  | { kind: "calendar_event"; status: "scheduled" | "cancelled" }
);
export interface ScheduleBlock {
  block_id: ID; item_id: ID; revision: Revision;
  start_at: UTC; end_at: UTC; timezone: string; time_binding: TimeBinding;
  all_day: boolean; local_start?: string; local_end?: string; locked: boolean;
  estimate_source?: "user" | "model" | "measured";
}
export interface ReminderRule {
  rule_id: ID; assistant_id: ID; item_id?: ID; revision: Revision;
  rule: Obj; timezone: string; time_binding: TimeBinding;
  enabled: boolean; next_fire_at?: UTC;
  catch_up: "within_grace" | "current_day_once" | "skip";
  grace_seconds: number;
}
export interface PlanDraft {
  draft_id: ID; revision: Revision; assistant_id: ID;
  status: "draft" | "committed" | "discarded";
  affected_versions: VersionRef[]; affected_time_ranges: { start_at: UTC; end_at: UTC }[];
  changes: Obj[]; unresolved_estimates: string[]; sources: SourceRef[];
}

// Attention, intention, delivery and affect are separate aggregates.
export interface AttentionItem {
  attention_id: ID; assistant_id: ID; revision: Revision; scope: Scope;
  origin_session_id?: ID; source_refs: SourceRef[];
  goal: string; condition: { type: string; version: number; args: Obj };
  state: "candidate" | "active" | "waiting" | "resolved" | "cancelled" | "expired";
  priority: number; next_review_at: UTC; expires_at?: UTC;
  last_evaluated_event_seq?: Seq; last_fact_fingerprint?: string;
}
export interface IntentionProposal {
  proposal_id: ID; attention_id: ID; attention_revision: Revision;
  kind: "silent_update" | "read_more" | "suggest" | "notify" | "prepare_draft";
  reason: string; evidence_refs: SourceRef[];
  urgency: number; confidence: number; expected_benefit: number;
  expires_at: UTC; target_ref?: ID; proposed_action?: Obj;
}
export type Route =
  | { type: "session"; session_id: ID; message_id?: ID }
  | { type: "terminal"; terminal_session_id: ID; result_ref?: ID; result_version?: Revision }
  | { type: "planner"; item_id: ID }
  | { type: "memory"; memory_id: ID };
export interface Delivery {
  delivery_id: ID; intention_id: ID; revision: Revision;
  fact_key: string; fact_version: string; purpose: string; dedupe_key: string;
  status: "pending" | "deferred" | "presented" | "seen" | "dismissed" | "revoked" | "expired";
  surface: "pet" | "workspace" | "system_notification";
  text: string; actions: { action_id: string; label: string; route: Route }[];
  not_before: UTC; expires_at: UTC; source_refs: SourceRef[];
  delivered_at?: UTC; seen_at?: UTC; dismissed_at?: UTC;
}
export type AffectDimension = "joy" | "pride" | "playful_irritation" |
  "concern" | "curiosity" | "disappointment";
export interface AffectState {
  assistant_id: ID; revision: Revision; config_version: Revision;
  scores: Record<AffectDimension, number>; calculated_at: UTC;
  last_accepted_seq: Seq;
}
export interface AppraisalProposal {
  proposal_id: ID; cause_event_id: ID; source_event_seq: Seq;
  appraisal_kind: string; semantic_label: string;
  intensity: number; confidence: number; evidence_refs: SourceRef[];
  persona_snapshot_version: Revision;
}
export interface ExpressionPlan {
  presentation_id: ID; source_event_id: ID; affect_version: Revision;
  emotion_tag: string; intensity_bucket: "subtle" | "moderate" | "expressive";
  gesture_id: string; gaze_target: string; speech_style: string; expires_at: UTC;
}

// External execution capability is independent of the internal Pi worker.
export type ExecutorKind = "codex" | "opencode" | "terminal";
export interface ExecutionCapabilities {
  adapter_version: string; executor_version?: string;
  terminal: boolean; observable: boolean; resumable: boolean; controllable: boolean;
  evidence_format?: string;
}
export interface TerminalSession {
  terminal_session_id: ID; executor_kind: ExecutorKind; adapter_version: string;
  external_session_id?: string; cwd: string;
  process_ownership: "chela" | "external";
  process_state: "starting" | "running" | "exited" | "interrupted";
  last_result_ref?: ID; task_id?: ID;
}
export type ModelRole = "chat" | "compaction" | "memory_extract" |
  "consolidation" | "proactive" | "embedding";
export interface ResolvedModel {
  requested_ref: string; actual_ref: string; provider: string; catalog_version: string;
  route_kind: "direct_provider" | "magpie_gateway";
  credential_ref: string; endpoint: string;
  context_window: number | null; max_output_tokens: number | null;
  capabilities: { text: boolean | null; image: boolean | null; tools: boolean | null; streaming: boolean | null; structured_output: boolean | null };
  config_fingerprint: string;
}
export interface CapabilityManifest {
  capability_id: string; version: string; build_hash: string;
  type: "builtin" | "pi_extension" | "mcp" | "skill" | "executor";
  trust: "managed" | "trusted-native" | "external-executor";
  compatibility_level?: "A" | "B" | "C" | "D" | "E";
  dependencies: string[]; tool_namespace: string; config_schema: Obj;
}

export interface RuntimeConfigSnapshot {
  config_id: ID; config_hash: string; resource_manifest_ref: BlobRef;
  capability_versions: { capability_id: string; version: string; build_hash: string }[];
  settings: Obj; agent_dir: string; workspace_id?: ID;
  discovery_policy: "explicit_resources_only";
}
export interface ContextSeed {
  seed_id: ID; persona_version: Revision; affect_version: Revision; scope: RunScope;
  system_instructions: string;
  project_instructions: { text: string; source: SourceRef }[];
  data_blocks: { kind: "memory" | "task_state" | "work_snapshot" | "reference"; text: string; sources: SourceRef[] }[];
  selected_memory_versions: VersionRef[]; setting_versions: VersionRef[];
  output_reserve: number; tool_catalog_hash: string;
}
export type ContextPacket = { packet_hash: string } &
  ({ content: ContextSeed; blob_ref?: never } | { blob_ref: BlobRef; content?: never });

// NDJSON transport. For replies, method and request_id echo the request.
export interface WireBase {
  protocol_version: 1; worker_id: ID; epoch: number; worker_seq: number;
  request_id: ID; correlation_id: ID; context?: ContextIds;
}
// Checkpoint success uses ack only; response(ok:false) reports failure.
// Other responses follow ResponsePayloads. A live ui.request waits on UI; ui.reply
// is an optional adapter delivery path, never a second response owner.
export interface RequestPayloads {
  "session.open": { context: ContextIds; lease: AttemptLease; image: PiSessionImage; scope: RunScope; runtime_config: RuntimeConfigSnapshot; cwd: string; model: ResolvedModel; };
  "run.start": { run: RunSnapshot; context_packet: ContextPacket; input: ContentBlock[]; };
  "run.steer": { input_id: ID; content: ContentBlock[]; };
  "run.followUp": { input_id: ID; content: ContentBlock[]; };
  "run.cancel": CancelRun;
  "session.checkpoint": CheckpointRequest;
  "session.compaction_commit": CompactionCommit;
  "session.context_repair_commit": ContextRepairCommit;
  "model.request.prepare": ModelRequestPrepare;
  "model.request.finish": ModelRequestFinish;
  "tool.request": ToolRequest;
  "ui.request": { ui_request_id: ID; kind: "select" | "confirm" | "input" | "editor"; schema: Obj; expires_at: UTC; };
  "ui.reply": { ui_request_id: ID; answer: Json; cancelled: boolean; };
  "session.dispose": { session_id: ID; branch_id: ID; reason: string; };
}
export interface EventPayloads {
  "worker.ready": { sdk_version: string; sdk_build: string; entry_format_version: string; capabilities: string[]; };
  "worker.health": { state: "ready" | "busy" | "degraded"; rss_bytes: number; };
  "run.accepted": { run_id: ID; attempt_id: ID; };
  "stream.delta": { stream_id: ID; chunk_index: number; text: string; };
  "tool.progress": { invocation_id: ID; text: string; };
  "run.settled": { run_id: ID; attempt_id: ID; final_checkpoint: CheckpointAck; outcome: "succeeded" | "failed" | "cancelled"; error?: DomainError; };
  "error": DomainError;
}
export type RequestFrame = {
  [M in keyof RequestPayloads]: WireBase & { context: ContextIds; kind: "request"; method: M; payload: RequestPayloads[M]; }
}[keyof RequestPayloads];
export type EventFrame = {
  [M in keyof EventPayloads]: WireBase & {
    kind: "event"; method: M; payload: EventPayloads[M];
  } & (M extends "worker.ready" | "worker.health" ? { requires_ack: false } :
       M extends "run.settled" ? { context: ContextIds; requires_ack: true } :
       { context: ContextIds; requires_ack: false })
}[keyof EventPayloads];
export interface ResponsePayloads {
  "session.open": { opened: true; canonical_revision: Revision };
  "run.start": { accepted: true; run_id: ID; attempt_id: ID };
  "run.steer": { accepted_input_id: ID };
  "run.followUp": { accepted_input_id: ID };
  "run.cancel": { cancellation_recorded: true; run_id: ID };
  "session.checkpoint": CheckpointAck;
  "session.compaction_commit": SafeCutToken;
  "session.context_repair_commit": CheckpointAck;
  "model.request.prepare": ModelPermit;
  "model.request.finish": { recorded: true };
  "tool.request": ToolResult;
  "ui.request": { ui_request_id: ID; answer: Json; cancelled: boolean };
  "ui.reply": { recorded: true };
  "session.dispose": { disposed: true };
}
export type ResponseFrame = {
  [M in keyof ResponsePayloads]: WireBase & { context: ContextIds; kind: "response"; method: M } &
    (M extends "session.checkpoint" | "session.compaction_commit" | "session.context_repair_commit"
      ? { ok: false; error: DomainError }
      : { ok: true; payload: ResponsePayloads[M] } | { ok: false; error: DomainError })
}[keyof ResponsePayloads];
export interface AckPayloads {
  "session.checkpoint": CheckpointAck;
  "session.compaction_commit": SafeCutToken;
  "session.context_repair_commit": CheckpointAck;
  "run.settled": { committed_seq: Seq; run_revision: Revision };
}
export type AckFrame = {
  [M in keyof AckPayloads]: WireBase & { context: ContextIds; kind: "ack"; method: M; payload: AckPayloads[M] }
}[keyof AckPayloads];
export type CancelFrame = WireBase & { context: ContextIds; kind: "cancel"; method: "request.cancel"; payload: { target_request_id: ID; reason: string } };
export type WireFrame = RequestFrame | EventFrame | ResponseFrame | AckFrame | CancelFrame;

// Implementation ports. Business state is always committed by Go.
export interface SessionService {
  SubmitMessage(command: Command<SubmitMessage>): Promise<CommandResult<SubmitReceipt>>;
  CancelRun(command: Command<CancelRun>): Promise<CommandResult<RunSnapshot>>;
  RecoverRun(command: Command<RecoverRun>): Promise<CommandResult<RunSnapshot>>;
  GetRun(run_id: ID): Promise<Snapshot<RunSnapshot>>;
}
export interface MemoryService {
  Propose(command: Command<MemoryProposal>): Promise<CommandResult<{ proposal_id: ID }>>;
  Publish(command: Command<{ proposal_id: ID; expected_slot_revision: Revision; expected_memory_revision?: Revision }>): Promise<CommandResult<VersionRef>>;
  Retrieve(query: string, scope: RunScope, at: UTC, token_budget: number): Promise<EvidenceBundle>;
  Forget(command: Command<{ memory_id: ID; expected_revision: Revision; block_relearning: boolean }>): Promise<CommandResult<VersionRef>>;
}
export interface ModelCatalogPort {
  FetchCatalog(etag?: string): Promise<{ version: string; etag: string; fetched_at: UTC; models: Obj[] }>;
  ResolveRoute(model_ref: string, role: ModelRole, required_capabilities: string[]): Promise<ResolvedModel>;
}
