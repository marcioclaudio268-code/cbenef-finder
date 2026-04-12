export type CbenefCstSource = "informado" | "sugerido" | "ajustado" | "none";

export type CbenefConfidenceLevel = "high" | "medium" | "low";

export interface CbenefRuleVersion {
  version_label: string;
  version_code: string | null;
  published_at: string;
}

export interface CbenefResult {
  cbenef_code: string;
  informed_cst_icms: string;
  suggested_cst_icms: string;
  final_cst_icms: string;
  cst_source: CbenefCstSource;
  cst_warning?: string;
  confidence_score: number;
  confidence_level: CbenefConfidenceLevel;
  matched_rule_id: string | null;
  application_context: string;
  legal_basis_name: string;
  legal_basis_summary: string;
  legal_basis_url: string | null;
  rule_version: CbenefRuleVersion | null;
  last_updated_at: string;
  input_ncm: string;
  matched_ncm: string;
  explanation: string;
  matched_by_ncm_exact: boolean;
  matched_by_ncm_prefix: boolean;
  keyword_match_count: number;
  used_informed_cst: boolean;
  auto_suggested_cst: boolean;
  data_origin: string;
  normalized_description: string;
  matched_keywords: string[];
  excluded_keywords_hit: string[];
  inferred_macro_group: string;
  inferred_subgroup: string;
  informed_group: string;
  group_consistency_status: string;
  product_family: string;
  product_type: string;
  presentation_type: string;
  output_st_applicable: boolean | null;
  output_icms_rate: number | null;
  output_cfop: string;
  output_trib_code: string;
  decision_reason: string;
}
