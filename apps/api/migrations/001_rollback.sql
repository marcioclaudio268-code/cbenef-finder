BEGIN;

DROP TRIGGER IF EXISTS trg_cbenef_rules_set_updated_at ON public.cbenef_rules;
DROP TRIGGER IF EXISTS trg_rule_versions_set_updated_at ON public.rule_versions;
DROP FUNCTION IF EXISTS public.set_updated_at();

DROP TABLE IF EXISTS public.query_logs;
DROP TABLE IF EXISTS public.cbenef_rules;
DROP TABLE IF EXISTS public.rule_versions;

COMMIT;
