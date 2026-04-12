BEGIN;

ALTER TABLE public.cbenef_rules
  ADD COLUMN IF NOT EXISTS rule_origin text,
  ADD COLUMN IF NOT EXISTS validation_status text,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS validated_by text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS replaced_by_rule_id uuid,
  ADD COLUMN IF NOT EXISTS rule_confidence text,
  ADD COLUMN IF NOT EXISTS operation_destination_type text,
  ADD COLUMN IF NOT EXISTS tax_regime_scope text,
  ADD COLUMN IF NOT EXISTS st_scope text,
  ADD COLUMN IF NOT EXISTS restriction_notes text;

UPDATE public.cbenef_rules
SET validation_status = 'draft'
WHERE validation_status IS NULL;

UPDATE public.cbenef_rules
SET operation_destination_type = 'consumer_final'
WHERE operation_destination_type IS NULL;

UPDATE public.cbenef_rules
SET tax_regime_scope = 'rpa_cst'
WHERE tax_regime_scope IS NULL;

UPDATE public.cbenef_rules
SET st_scope = 'any'
WHERE st_scope IS NULL;

ALTER TABLE public.cbenef_rules
  ALTER COLUMN validation_status SET DEFAULT 'draft',
  ALTER COLUMN validation_status SET NOT NULL,
  ALTER COLUMN operation_destination_type SET DEFAULT 'consumer_final',
  ALTER COLUMN operation_destination_type SET NOT NULL,
  ALTER COLUMN tax_regime_scope SET DEFAULT 'rpa_cst',
  ALTER COLUMN tax_regime_scope SET NOT NULL,
  ALTER COLUMN st_scope SET DEFAULT 'any',
  ALTER COLUMN st_scope SET NOT NULL;

ALTER TABLE public.cbenef_rules
  ADD CONSTRAINT cbenef_rules_validation_status_check
    CHECK (validation_status IN ('draft', 'validated', 'invalid')),
  ADD CONSTRAINT cbenef_rules_rule_origin_check
    CHECK (
      rule_origin IS NULL
      OR rule_origin IN ('imported', 'manual_validated', 'legacy_invalid', 'office_operational')
    ),
  ADD CONSTRAINT cbenef_rules_rule_confidence_check
    CHECK (
      rule_confidence IS NULL
      OR rule_confidence IN ('imported_low', 'office_validated', 'legal_confirmed')
    ),
  ADD CONSTRAINT cbenef_rules_operation_destination_type_check
    CHECK (operation_destination_type IN ('consumer_final', 'contribuinte', 'any')),
  ADD CONSTRAINT cbenef_rules_tax_regime_scope_check
    CHECK (tax_regime_scope IN ('rpa_cst', 'simples_csosn', 'any')),
  ADD CONSTRAINT cbenef_rules_st_scope_check
    CHECK (st_scope IN ('inside_st', 'outside_st', 'any')),
  ADD CONSTRAINT cbenef_rules_valid_date_range_check
    CHECK (
      valid_to IS NULL
      OR valid_from IS NULL
      OR valid_to >= valid_from
    ),
  ADD CONSTRAINT cbenef_rules_replaced_by_rule_id_fkey
    FOREIGN KEY (replaced_by_rule_id) REFERENCES public.cbenef_rules(id);

COMMIT;
