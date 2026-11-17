ALTER TABLE run_parameters ADD COLUMN context_settings_json TEXT CHECK(context_settings_json IS NULL OR json_valid(context_settings_json));
