import type {
  CbenefConfidenceLevel,
  CbenefCstSource,
  CbenefResult,
  CbenefRuleVersion,
} from "./contract.ts";

const DEFAULT_APPLICATION_CONTEXT =
  "Opera\u00e7\u00e3o interna \u2014 Estado de S\u00e3o Paulo";

export interface ProductClassification {
  product_family: string;
  product_type: string;
  presentation_type: string;
}

export interface GroupInference {
  inferred_macro_group: string;
  inferred_subgroup: string;
}

export interface LowConfidenceResponseInput {
  ncm: string;
  informedCst: string | null;
  normalizedDescription: string;
  classification: ProductClassification;
  groupInference: GroupInference;
  informedGroup: string | null;
  confidenceScore?: number;
  matchedNcm?: string;
  applicationContext?: string | null;
  legalBasisName?: string | null;
  legalBasisSummary?: string;
  legalBasisUrl?: string | null;
  explanation?: string;
  decisionReason?: string;
  matchedByNcmExact?: boolean;
  matchedByNcmPrefix?: boolean;
  excludedKeywordsHit?: string[];
  lastUpdatedAt?: string;
  dataOrigin?: string;
}

export interface ResolvedRuleForResponse {
  id: string;
  cbenef_code: string;
  ncm: string;
  cst_icms: string | null;
  suggested_cst_icms: string | null;
  application_context: string | null;
  legal_basis: string | null;
  legal_url: string | null;
  legal_basis_name: string | null;
  legal_basis_summary: string | null;
  legal_basis_url: string | null;
  data_origin: string;
  updated_at: string | null;
  created_at: string;
  product_family: string | null;
  product_type: string | null;
  presentation_type: string | null;
  output_st_applicable: boolean | null;
  output_cfop: string | null;
  output_icms_rate: number | null;
  output_trib_code: string | null;
}

export interface ResolvedResponseInput {
  bestRule: ResolvedRuleForResponse;
  informedCst: string | null;
  finalCst: string;
  cstSource: CbenefCstSource;
  cstWarning?: string;
  confidence: number;
  confidenceLevel: CbenefConfidenceLevel;
  ruleVersion: CbenefRuleVersion | null;
  ncm: string;
  explanation: string;
  matchedByNcmExact: boolean;
  matchedByNcmPrefix: boolean;
  keywordMatchCount: number;
  usedInformedCst: boolean;
  autoSuggestedCst: boolean;
  normalizedDescription: string;
  matchedKeywords: string[];
  excludedKeywordsHit: string[];
  groupInference: GroupInference;
  informedGroup: string | null;
  groupConsistency: string;
  classification: ProductClassification;
  decisionReason: string;
}

export function buildLowConfidenceResponse(input: LowConfidenceResponseInput): CbenefResult {
  return {
    cbenef_code: "",
    informed_cst_icms: input.informedCst || "",
    suggested_cst_icms: "",
    final_cst_icms: "",
    cst_source: "none",
    confidence_score: input.confidenceScore ?? 0,
    confidence_level: "low",
    matched_rule_id: null,
    application_context: input.applicationContext || DEFAULT_APPLICATION_CONTEXT,
    legal_basis_name: input.legalBasisName || "",
    legal_basis_summary: input.legalBasisSummary ?? "",
    legal_basis_url: input.legalBasisUrl ?? null,
    rule_version: null,
    last_updated_at: input.lastUpdatedAt ?? new Date().toISOString(),
    input_ncm: input.ncm,
    matched_ncm: input.matchedNcm ?? "",
    explanation: input.explanation ?? "",
    matched_by_ncm_exact: input.matchedByNcmExact ?? false,
    matched_by_ncm_prefix: input.matchedByNcmPrefix ?? false,
    keyword_match_count: 0,
    used_informed_cst: false,
    auto_suggested_cst: false,
    data_origin: input.dataOrigin ?? "",
    normalized_description: input.normalizedDescription,
    matched_keywords: [],
    excluded_keywords_hit: input.excludedKeywordsHit ?? [],
    inferred_macro_group: input.groupInference.inferred_macro_group,
    inferred_subgroup: input.groupInference.inferred_subgroup,
    informed_group: input.informedGroup || "",
    group_consistency_status: "",
    product_family: input.classification.product_family,
    product_type: input.classification.product_type,
    presentation_type: input.classification.presentation_type,
    output_st_applicable: null,
    output_cfop: "",
    output_trib_code: "",
    output_icms_rate: null,
    decision_reason: input.decisionReason ?? "",
  };
}

export function buildResolvedResponse(input: ResolvedResponseInput): CbenefResult {
  const { bestRule } = input;
  const legalBasisUrl = bestRule.legal_basis_url || bestRule.legal_url || null;

  return {
    cbenef_code: bestRule.cbenef_code,
    informed_cst_icms: input.informedCst || "",
    suggested_cst_icms: bestRule.suggested_cst_icms || bestRule.cst_icms || "",
    final_cst_icms: input.finalCst,
    cst_source: input.cstSource,
    cst_warning: input.cstWarning,
    confidence_score: input.confidence,
    confidence_level: input.confidenceLevel,
    matched_rule_id: bestRule.id,
    application_context: bestRule.application_context || DEFAULT_APPLICATION_CONTEXT,
    legal_basis_name: bestRule.legal_basis_name || bestRule.legal_basis || "",
    legal_basis_summary: bestRule.legal_basis_summary || "",
    legal_basis_url: legalBasisUrl,
    rule_version: input.ruleVersion,
    last_updated_at: bestRule.updated_at || bestRule.created_at,
    input_ncm: input.ncm,
    matched_ncm: bestRule.ncm,
    explanation: input.explanation,
    matched_by_ncm_exact: input.matchedByNcmExact,
    matched_by_ncm_prefix: input.matchedByNcmPrefix,
    keyword_match_count: input.keywordMatchCount,
    used_informed_cst: input.usedInformedCst,
    auto_suggested_cst: input.autoSuggestedCst,
    data_origin: bestRule.data_origin,
    normalized_description: input.normalizedDescription,
    matched_keywords: input.matchedKeywords,
    excluded_keywords_hit: input.excludedKeywordsHit,
    inferred_macro_group: input.groupInference.inferred_macro_group,
    inferred_subgroup: input.groupInference.inferred_subgroup,
    informed_group: input.informedGroup || "",
    group_consistency_status: input.groupConsistency,
    product_family: bestRule.product_family || input.classification.product_family,
    product_type: bestRule.product_type || input.classification.product_type,
    presentation_type: bestRule.presentation_type || input.classification.presentation_type,
    output_st_applicable: bestRule.output_st_applicable ?? null,
    output_cfop: bestRule.output_cfop || "",
    output_trib_code: bestRule.output_trib_code || "",
    output_icms_rate: bestRule.output_icms_rate ?? null,
    decision_reason: input.decisionReason,
  };
}
