ALTER TABLE consolidation_jobs ADD COLUMN run_id TEXT REFERENCES runs;
ALTER TABLE consolidation_jobs ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE run_parameters ADD COLUMN consolidation_job_id TEXT REFERENCES consolidation_jobs;
ALTER TABLE run_parameters ADD COLUMN consolidation_fence INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX memory_source_once ON domain_events(aggregate_id) WHERE event_type='memory.source';
