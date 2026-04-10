
ALTER TABLE public.cbenef_rules
  ADD COLUMN IF NOT EXISTS product_family text,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS presentation_type text,
  ADD COLUMN IF NOT EXISTS keyword_include text[],
  ADD COLUMN IF NOT EXISTS keyword_exclude text[],
  ADD COLUMN IF NOT EXISTS description_patterns text[],
  ADD COLUMN IF NOT EXISTS output_st_applicable boolean,
  ADD COLUMN IF NOT EXISTS output_cst_icms text,
  ADD COLUMN IF NOT EXISTS output_trib_code text,
  ADD COLUMN IF NOT EXISTS output_cfop text,
  ADD COLUMN IF NOT EXISTS decision_reason text;
