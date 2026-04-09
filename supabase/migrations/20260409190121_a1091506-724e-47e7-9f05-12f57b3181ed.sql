-- Drop overly permissive policies
DROP POLICY IF EXISTS "Service role can manage source_feeds" ON public.source_feeds;
DROP POLICY IF EXISTS "Service role can manage source_update_runs" ON public.source_update_runs;
DROP POLICY IF EXISTS "Service role can manage rule_versions" ON public.rule_versions;
DROP POLICY IF EXISTS "Service role can manage cbenef rules" ON public.cbenef_rules;

-- Recreate with role check (service_role only for writes)
CREATE POLICY "Service role manages source_feeds"
  ON public.source_feeds FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages source_update_runs"
  ON public.source_update_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages rule_versions"
  ON public.rule_versions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages cbenef_rules"
  ON public.cbenef_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
