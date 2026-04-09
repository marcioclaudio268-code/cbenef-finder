-- Create source_feeds table
CREATE TABLE public.source_feeds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  state TEXT NOT NULL DEFAULT 'SP',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create source_update_runs table
CREATE TABLE public.source_update_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_feed_id UUID REFERENCES public.source_feeds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create rule_versions table
CREATE TABLE public.rule_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_feed_id UUID REFERENCES public.source_feeds(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cbenef_rules table
CREATE TABLE public.cbenef_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_version_id UUID REFERENCES public.rule_versions(id) ON DELETE CASCADE,
  cbenef_code TEXT NOT NULL,
  ncm TEXT NOT NULL,
  cst_icms TEXT,
  description TEXT,
  keywords TEXT[],
  legal_basis TEXT,
  legal_url TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'SP',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create query_logs table
CREATE TABLE public.query_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ean TEXT,
  description TEXT,
  ncm TEXT,
  cst_icms TEXT,
  brand TEXT,
  suggested_cbenef TEXT,
  confidence_score NUMERIC(5,2),
  rule_id UUID REFERENCES public.cbenef_rules(id),
  matched_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_cbenef_rules_ncm ON public.cbenef_rules(ncm);
CREATE INDEX idx_cbenef_rules_cst ON public.cbenef_rules(cst_icms);
CREATE INDEX idx_cbenef_rules_code ON public.cbenef_rules(cbenef_code);
CREATE INDEX idx_query_logs_created ON public.query_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.source_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_update_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbenef_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

-- Public read access to cbenef_rules
CREATE POLICY "Anyone can read active cbenef rules"
  ON public.cbenef_rules FOR SELECT
  USING (is_active = true);

-- Public insert on query_logs
CREATE POLICY "Anyone can insert query logs"
  ON public.query_logs FOR INSERT
  WITH CHECK (true);

-- Service role for admin tables
CREATE POLICY "Service role can manage source_feeds"
  ON public.source_feeds FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage source_update_runs"
  ON public.source_update_runs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage rule_versions"
  ON public.rule_versions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage cbenef rules"
  ON public.cbenef_rules FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can read query logs"
  ON public.query_logs FOR SELECT
  USING (true);
