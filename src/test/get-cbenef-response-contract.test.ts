import { describe, expect, it } from "vitest";

import type { CbenefResult as FrontendCbenefResult, CbenefRuleVersion } from "@/types/cbenef";

import {
  buildLowConfidenceResponse,
  buildResolvedResponse,
  type GroupInference,
  type ProductClassification,
  type ResolvedRuleForResponse,
} from "../../supabase/functions/get-cbenef/response.ts";

const REQUIRED_PUBLIC_KEYS = [
  "cbenef_code",
  "informed_cst_icms",
  "suggested_cst_icms",
  "final_cst_icms",
  "cst_source",
  "confidence_score",
  "confidence_level",
  "matched_rule_id",
  "application_context",
  "legal_basis_name",
  "legal_basis_summary",
  "legal_basis_url",
  "rule_version",
  "last_updated_at",
  "input_ncm",
  "matched_ncm",
  "explanation",
  "matched_by_ncm_exact",
  "matched_by_ncm_prefix",
  "keyword_match_count",
  "used_informed_cst",
  "auto_suggested_cst",
  "data_origin",
  "normalized_description",
  "matched_keywords",
  "excluded_keywords_hit",
  "inferred_macro_group",
  "inferred_subgroup",
  "informed_group",
  "group_consistency_status",
  "product_family",
  "product_type",
  "presentation_type",
  "output_st_applicable",
  "output_icms_rate",
  "output_cfop",
  "output_trib_code",
  "decision_reason",
] as const satisfies readonly (keyof FrontendCbenefResult)[];

const BASE_CLASSIFICATION = {
  product_family: "queijos",
  product_type: "mussarela",
  presentation_type: "fatiada",
} satisfies ProductClassification;

const BASE_GROUP_INFERENCE = {
  inferred_macro_group: "laticinios",
  inferred_subgroup: "queijos",
} satisfies GroupInference;

const BASE_RULE_VERSION = {
  version_label: "Base ativa abril/2026",
  version_code: "sp-2026-04",
  published_at: "2026-04-13T09:30:00.000Z",
} satisfies CbenefRuleVersion;

function buildResolvedRule(
  overrides: Partial<ResolvedRuleForResponse> = {},
): ResolvedRuleForResponse {
  return {
    id: "rule-queijo-001",
    cbenef_code: "SP123456",
    ncm: "04061010",
    cst_icms: "020",
    suggested_cst_icms: "020",
    application_context: "Operacao interna - Estado de Sao Paulo",
    legal_basis: "RICMS/SP",
    legal_url: "https://example.com/ricms-sp",
    legal_basis_name: "RICMS/SP",
    legal_basis_summary: "Beneficio aplicavel para saida interna de laticinios.",
    legal_basis_url: "https://example.com/ricms-sp",
    data_origin: "imported",
    updated_at: "2026-04-13T11:45:00.000Z",
    created_at: "2026-04-10T08:00:00.000Z",
    product_family: "queijos",
    product_type: "mussarela",
    presentation_type: "fatiada",
    output_st_applicable: false,
    output_cfop: "5405",
    output_icms_rate: 18,
    output_trib_code: "TRIB123",
    ...overrides,
  };
}

function assertPublicContract(result: FrontendCbenefResult) {
  for (const key of REQUIRED_PUBLIC_KEYS) {
    expect(result).toHaveProperty(key);
  }

  expect(Number.isNaN(Date.parse(result.last_updated_at))).toBe(false);
  expect(result.confidence_score).toBeGreaterThanOrEqual(0);
  expect(result.confidence_score).toBeLessThanOrEqual(1);

  if (result.rule_version) {
    expect(result.rule_version.version_label).not.toBe("");
    expect(Number.isNaN(Date.parse(result.rule_version.published_at))).toBe(false);
  }

  return result;
}

describe("get-cbenef public response contract", () => {
  it("returns a high-confidence payload with the final registration fields protected", () => {
    const result = assertPublicContract(
      buildResolvedResponse({
        bestRule: buildResolvedRule(),
        informedCst: "020",
        finalCst: "020",
        cstSource: "informado",
        cstWarning: "",
        confidence: 0.93,
        confidenceLevel: "high",
        ruleVersion: BASE_RULE_VERSION,
        ncm: "04061010",
        explanation: "Classificacao com alta confianca para queijo mussarela fatiada.",
        matchedByNcmExact: true,
        matchedByNcmPrefix: false,
        keywordMatchCount: 3,
        usedInformedCst: true,
        autoSuggestedCst: false,
        normalizedDescription: "queijo mussarela fatiada",
        matchedKeywords: ["queijo", "mussarela", "fatiada"],
        excludedKeywordsHit: [],
        groupInference: BASE_GROUP_INFERENCE,
        informedGroup: "laticinios",
        groupConsistency: "coerente",
        classification: BASE_CLASSIFICATION,
        decisionReason: "Regra validada por NCM, descricao e CST informado.",
      }),
    );

    expect(result.confidence_level).toBe("high");
    expect(result.confidence_score).toBe(0.93);
    expect(result.cbenef_code).toBe("SP123456");
    expect(result.final_cst_icms).toBe("020");
    expect(result.output_cfop).toBe("5405");
    expect(result.output_icms_rate).toBe(18);
    expect(result.output_trib_code).toBe("TRIB123");
    expect(result.output_st_applicable).toBe(false);
    expect(result.rule_version).toEqual(BASE_RULE_VERSION);
    expect(result.last_updated_at).toBe("2026-04-13T11:45:00.000Z");
  });

  it("returns a structured low-confidence payload without breaking the frontend contract", () => {
    const result = assertPublicContract(
      buildLowConfidenceResponse({
        ncm: "04061010",
        informedCst: null,
        normalizedDescription: "produto generico",
        classification: {
          product_family: "nao_identificado",
          product_type: "nao_identificado",
          presentation_type: "",
        },
        groupInference: {
          inferred_macro_group: "",
          inferred_subgroup: "",
        },
        informedGroup: null,
        confidenceScore: 0.31,
        legalBasisSummary: "Nenhuma regra suficientemente confiavel para o NCM informado.",
        explanation: "A descricao nao trouxe sinais suficientes para uma classificacao segura.",
        decisionReason: "Descricao insuficiente para diferenciar o cadastro fiscal.",
        matchedByNcmExact: false,
        matchedByNcmPrefix: true,
        excludedKeywordsHit: ["teste"],
        lastUpdatedAt: "2026-04-13T12:00:00.000Z",
      }),
    );

    expect(result.confidence_level).toBe("low");
    expect(result.confidence_score).toBe(0.31);
    expect(result.cbenef_code).toBe("");
    expect(result.final_cst_icms).toBe("");
    expect(result.output_cfop).toBe("");
    expect(result.output_icms_rate).toBeNull();
    expect(result.output_trib_code).toBe("");
    expect(result.output_st_applicable).toBeNull();
    expect(result.rule_version).toBeNull();
    expect(result.last_updated_at).toBe("2026-04-13T12:00:00.000Z");
  });

  it("keeps the shared frontend contract intact after API-style JSON serialization", () => {
    const payload = JSON.parse(
      JSON.stringify(
        buildResolvedResponse({
          bestRule: buildResolvedRule({
            id: "rule-queijo-002",
            cbenef_code: "SP654321",
            output_trib_code: "TRIB999",
            output_st_applicable: true,
            output_icms_rate: 12,
            output_cfop: "5102",
          }),
          informedCst: null,
          finalCst: "020",
          cstSource: "sugerido",
          confidence: 0.88,
          confidenceLevel: "high",
          ruleVersion: BASE_RULE_VERSION,
          ncm: "04061010",
          explanation: "Resposta serializavel consumida pelo frontend.",
          matchedByNcmExact: true,
          matchedByNcmPrefix: false,
          keywordMatchCount: 2,
          usedInformedCst: false,
          autoSuggestedCst: true,
          normalizedDescription: "queijo mussarela",
          matchedKeywords: ["queijo", "mussarela"],
          excludedKeywordsHit: [],
          groupInference: BASE_GROUP_INFERENCE,
          informedGroup: "",
          groupConsistency: "inferido",
          classification: BASE_CLASSIFICATION,
          decisionReason: "Contrato publico preservado apos serializacao.",
        }),
      ),
    ) as FrontendCbenefResult;

    const result = assertPublicContract(payload);

    expect(result.output_trib_code).toBe("TRIB999");
    expect(result.rule_version?.version_code).toBe("sp-2026-04");
    expect(result.output_cfop).toBe("5102");
    expect(result.output_icms_rate).toBe(12);
    expect(result.output_st_applicable).toBe(true);
  });
});
