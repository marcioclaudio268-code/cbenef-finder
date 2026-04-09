
-- Add new columns to cbenef_rules
ALTER TABLE public.cbenef_rules
  ADD COLUMN IF NOT EXISTS suggested_cst_icms text,
  ADD COLUMN IF NOT EXISTS application_context text DEFAULT 'Operação interna — Estado de São Paulo',
  ADD COLUMN IF NOT EXISTS legal_basis_name text,
  ADD COLUMN IF NOT EXISTS legal_basis_summary text;

-- Rename legal_basis to legal_basis_url if needed, but legal_url already exists
-- We'll use legal_url as legal_basis_url (already exists), and legal_basis as legal_basis_summary
-- Actually legal_basis and legal_url already exist, so let's just add the missing ones

-- Add version_code to rule_versions
ALTER TABLE public.rule_versions
  ADD COLUMN IF NOT EXISTS version_code text;
