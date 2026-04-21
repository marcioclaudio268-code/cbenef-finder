import { describe, expect, it } from "vitest";

import { scoreRule, selectSafeRuleCandidate, type CbenefRule, type ScoredRule } from "../../supabase/functions/get-cbenef/engine.ts";

const BASE_RULE: CbenefRule = {
  id: "rule-001",
  cbenef_code: "SP123456",
  ncm: "04061010",
  cst_icms: "020",
  suggested_cst_icms: "020",
  description: "Regra base",
  keywords: null,
  keyword_include: null,
  keyword_exclude: null,
  description_patterns: null,
  product_family: null,
  product_type: null,
  presentation_type: null,
  macro_group: null,
  subgroup: null,
  output_st_applicable: false,
  output_cst_icms: "020",
  output_cfop: "5102",
  output_icms_rate: 18,
  output_trib_code: "TRIB123",
  decision_reason: null,
  legal_basis: "RICMS/SP",
  legal_url: null,
  legal_basis_name: "RICMS/SP",
  legal_basis_summary: "Base legal padrao.",
  legal_basis_url: null,
  application_context: "Operacao interna - Estado de Sao Paulo",
  priority: 10,
  rule_version_id: null,
  is_active: true,
  data_origin: "manual",
  updated_at: "2026-04-21T10:00:00.000Z",
  created_at: "2026-04-20T10:00:00.000Z",
};

interface ScoreContext {
  strongTokens: string[];
  normalizedDescription: string;
  inferredType: string;
  inferredFamily: string;
  inferredPresentation: string;
  inferredMacro: string;
  inferredSub: string;
  informedGroup: string | null;
}

const SPECIFIC_CONTEXT: ScoreContext = {
  strongTokens: ["queijo", "mussarela", "fatiada"],
  normalizedDescription: "queijo mussarela fatiada",
  inferredType: "mussarela",
  inferredFamily: "queijos",
  inferredPresentation: "fatiada",
  inferredMacro: "laticinios",
  inferredSub: "queijos",
  informedGroup: null,
};

const GENERIC_CONTEXT: ScoreContext = {
  strongTokens: ["produto", "generico"],
  normalizedDescription: "produto generico",
  inferredType: "",
  inferredFamily: "",
  inferredPresentation: "",
  inferredMacro: "",
  inferredSub: "",
  informedGroup: null,
};

function buildRule(overrides: Partial<CbenefRule> = {}): CbenefRule {
  return {
    ...BASE_RULE,
    ...overrides,
  };
}

function scoreCandidate(
  overrides: Partial<CbenefRule>,
  context: ScoreContext = SPECIFIC_CONTEXT,
): ScoredRule {
  const rule = buildRule(overrides);

  return scoreRule(
    rule,
    context.strongTokens,
    context.normalizedDescription,
    context.inferredType,
    context.inferredFamily,
    context.inferredPresentation,
    context.inferredMacro,
    context.inferredSub,
    context.informedGroup,
  );
}

describe("get-cbenef safe fallback selection", () => {
  it("keeps an exact match eligible even without prefix evidence", () => {
    const selection = selectSafeRuleCandidate([
      scoreCandidate({ id: "rule-exact-1", priority: 3 }, GENERIC_CONTEXT),
    ], false);

    expect(selection.kind).toBe("resolved");
    expect(selection.winner?.rule.id).toBe("rule-exact-1");
  });

  it("allows prefix fallback when there is real evidence", () => {
    const selection = selectSafeRuleCandidate([
      scoreCandidate({
        id: "rule-prefix-strong",
        keyword_include: ["mussarela"],
        product_family: "queijos",
        product_type: "mussarela",
        presentation_type: "fatiada",
        macro_group: "laticinios",
      }),
      scoreCandidate({
        id: "rule-prefix-weak",
        keyword_include: ["queijo"],
        product_family: "queijos",
        macro_group: "laticinios",
        priority: 1,
      }),
    ], true);

    expect(selection.kind).toBe("resolved");
    expect(selection.winner?.rule.id).toBe("rule-prefix-strong");
  });

  it("drops prefix fallback to low confidence when semantic evidence is missing", () => {
    const selection = selectSafeRuleCandidate([
      scoreCandidate({
        id: "rule-prefix-fragil",
        priority: 20,
        data_origin: "imported",
      }, GENERIC_CONTEXT),
    ], true);

    expect(selection.kind).toBe("low_confidence");
    expect(selection.winner).toBeUndefined();
    expect(selection.decisionReason).toContain("Fallback por prefixo");
  });

  it("treats a weak tie as low confidence instead of using priority as the tiebreaker", () => {
    const selection = selectSafeRuleCandidate([
      scoreCandidate({
        id: "rule-tie-high-priority",
        keyword_include: ["queijo"],
        priority: 20,
      }),
      scoreCandidate({
        id: "rule-tie-low-priority",
        keyword_include: ["queijo"],
        priority: 1,
      }),
    ], true);

    expect(selection.kind).toBe("low_confidence");
    expect(selection.winner).toBeUndefined();
    expect(selection.decisionReason).toContain("Empate fraco");
  });
});
