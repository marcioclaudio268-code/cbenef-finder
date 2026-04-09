
-- Add source_type to source_feeds
ALTER TABLE public.source_feeds
ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'remote_json';

-- Add data_origin to cbenef_rules to distinguish seed from real imports
ALTER TABLE public.cbenef_rules
ADD COLUMN IF NOT EXISTS data_origin text NOT NULL DEFAULT 'seed';

-- Mark all existing rules as seed
UPDATE public.cbenef_rules SET data_origin = 'seed' WHERE data_origin = 'seed';

-- Mark existing feeds as remote_json
UPDATE public.source_feeds SET source_type = 'remote_json';
