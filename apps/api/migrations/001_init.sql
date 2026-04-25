BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label text NOT NULL,
  version_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rule_versions_status_check
    CHECK (status IN ('draft', 'validated', 'active', 'inactive', 'invalid'))
);

CREATE TABLE public.cbenef_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id uuid NOT NULL REFERENCES public.rule_versions(id) ON DELETE RESTRICT,
  cbenef_code text NOT NULL,
  ncm text NOT NULL,
  description text,
  keywords text[],
  keyword_include text[],
  keyword_exclude text[],
  cst_icms text,
  suggested_cst_icms text,
  output_cst_icms text,
  output_cfop text,
  output_icms_rate numeric(5,2),
  output_st_applicable boolean,
  application_context text,
  legal_basis text,
  legal_basis_name text,
  legal_basis_summary text,
  legal_basis_url text,
  legal_url text,
  data_origin text DEFAULT 'imported',
  decision_reason text,
  macro_group text,
  subgroup text,
  product_family text,
  product_type text,
  presentation_type text,
  rule_origin text,
  status text NOT NULL DEFAULT 'draft',
  status_reason text,
  validated_by text,
  validated_at timestamptz,
  valid_from date,
  valid_to date,
  replaced_by_rule_id uuid,
  rule_confidence text,
  operation_destination_type text NOT NULL DEFAULT 'consumer_final',
  tax_regime_scope text NOT NULL DEFAULT 'rpa_cst',
  st_scope text NOT NULL DEFAULT 'any',
  restriction_notes text,
  priority integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'SP',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cbenef_rules_status_check
    CHECK (status IN ('draft', 'validated', 'active', 'inactive', 'invalid')),
  CONSTRAINT cbenef_rules_rule_origin_check
    CHECK (
      rule_origin IS NULL
      OR rule_origin IN ('imported', 'manual_validated', 'legacy_invalid', 'office_operational')
    ),
  CONSTRAINT cbenef_rules_rule_confidence_check
    CHECK (
      rule_confidence IS NULL
      OR rule_confidence IN ('imported_low', 'office_validated', 'legal_confirmed')
    ),
  CONSTRAINT cbenef_rules_operation_destination_type_check
    CHECK (operation_destination_type IN ('consumer_final', 'contribuinte', 'any')),
  CONSTRAINT cbenef_rules_tax_regime_scope_check
    CHECK (tax_regime_scope IN ('rpa_cst', 'simples_csosn', 'any')),
  CONSTRAINT cbenef_rules_st_scope_check
    CHECK (st_scope IN ('inside_st', 'outside_st', 'any')),
  CONSTRAINT cbenef_rules_valid_date_range_check
    CHECK (
      valid_to IS NULL
      OR valid_from IS NULL
      OR valid_to >= valid_from
    ),
  CONSTRAINT cbenef_rules_replaced_by_rule_id_fkey
    FOREIGN KEY (replaced_by_rule_id) REFERENCES public.cbenef_rules(id)
);

CREATE TABLE public.query_logs (
  id uuid PRIMARY KEY,
  route_name text NOT NULL,
  ean text,
  description text,
  ncm text,
  cst_icms text,
  brand text,
  suggested_cbenef text,
  confidence_score numeric(5,2),
  confidence_level text,
  matched_by text,
  response_mode text NOT NULL DEFAULT 'placeholder',
  matched_rule_id uuid REFERENCES public.cbenef_rules(id) ON DELETE SET NULL,
  request_payload jsonb NOT NULL,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT query_logs_response_mode_check
    CHECK (response_mode IN ('placeholder', 'resolved', 'low_confidence', 'error')),
  CONSTRAINT query_logs_confidence_level_check
    CHECK (
      confidence_level IS NULL
      OR confidence_level IN ('high', 'medium', 'low')
    ),
  CONSTRAINT query_logs_confidence_score_check
    CHECK (
      confidence_score IS NULL
      OR (confidence_score >= 0 AND confidence_score <= 1)
    )
);

CREATE INDEX idx_rule_versions_status ON public.rule_versions(status);
CREATE INDEX idx_rule_versions_is_current ON public.rule_versions(is_current);
CREATE INDEX idx_cbenef_rules_rule_version_id ON public.cbenef_rules(rule_version_id);
CREATE INDEX idx_cbenef_rules_ncm ON public.cbenef_rules(ncm);
CREATE INDEX idx_cbenef_rules_status ON public.cbenef_rules(status);
CREATE INDEX idx_query_logs_created_at ON public.query_logs(created_at DESC);
CREATE INDEX idx_query_logs_route_name ON public.query_logs(route_name);
CREATE INDEX idx_query_logs_ncm ON public.query_logs(ncm);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rule_versions_set_updated_at
BEFORE UPDATE ON public.rule_versions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_cbenef_rules_set_updated_at
BEFORE UPDATE ON public.cbenef_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

COMMIT;
