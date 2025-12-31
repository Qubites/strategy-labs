-- Add unique constraint on version_id in live_candidates for upsert to work
ALTER TABLE public.live_candidates ADD CONSTRAINT live_candidates_version_id_unique UNIQUE (version_id);