function removeAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export interface CbenefRule {
  id: string;
  cbenef_code: string;
  ncm: string;
  cst_icms: string | null;
  suggested_cst_icms: string | null;
  description: string | null;
  keywords: string[] | null;
  keyword_include: string[] | null;
  keyword_exclude: string[] | null;
  description_patterns: string[] | null;
  product_family: string | null;
  product_type: string | null;
  presentation_type: string | null;
  macro_group: string | null;
  subgroup: string | null;
  output_st_applicable: boolean | null;
  output_cst_icms: string | null;
  output_cfop: string | null;
  output_icms_rate: number | null;
  output_trib_code: string | null;
  decision_reason: string | null;
  legal_basis: string | null;
  legal_url: string | null;
  legal_basis_name: string | null;
  legal_basis_summary: string | null;
  legal_basis_url: string | null;
  application_context: string | null;
  priority: number;
  rule_version_id: string | null;
  is_active: boolean;
  data_origin: string;
  updated_at: string;
  created_at: string;
}

export interface ScoredRule {
  rule: CbenefRule;
  score: number;
  excludeHit: boolean;
  includeHits: string[];
  descriptionPatternHits: string[];
  productFamilyMatch: boolean;
  productTypeMatch: boolean;
  groupMatch: boolean;
  presentationMatch: boolean;
}

interface RuleEvidenceSummary {
  strongSignalCount: number;
  weakSignalCount: number;
  semanticSignature: string;
}

export type RuleMatchMode = "exact" | "prefix";

export interface SafeRuleSelectionResult {
  kind: "resolved" | "low_confidence" | "insufficient_rule";
  winner?: ScoredRule;
  referenceRule?: ScoredRule;
  confidenceScore?: number;
  explanation?: string;
  decisionReason: string;
  legalBasisSummary?: string;
}

export function scoreRule(
  rule: CbenefRule,
  strongTokens: string[],
  normalizedDesc: string,
  inferredType: string,
  inferredFamily: string,
  inferredPresentation: string,
  inferredMacro: string,
  inferredSub: string,
  informedGroup: string | null,
): ScoredRule {
  let score = 0;
  let excludeHit = false;
  const includeHits: string[] = [];
  const descriptionPatternHits: string[] = [];

  const kwExclude = (rule.keyword_exclude || []).map((keyword) => removeAccents(keyword.toLowerCase()));
  for (const exclude of kwExclude) {
    if (strongTokens.includes(exclude) || normalizedDesc.includes(exclude)) excludeHit = true;
  }

  const kwInclude = (rule.keyword_include || []).map((keyword) => removeAccents(keyword.toLowerCase()));
  for (const include of kwInclude) {
    const parts = include.split(" ");
    if (parts.length > 1) {
      if (parts.every((part) => strongTokens.includes(part) || normalizedDesc.includes(part))) {
        score += 10;
        includeHits.push(include);
      }
    } else if (strongTokens.includes(include) || normalizedDesc.includes(include)) {
      score += 10;
      includeHits.push(include);
    }
  }

  for (const keyword of (rule.keywords || []).map((item) => removeAccents(item.toLowerCase()))) {
    if (strongTokens.includes(keyword) || normalizedDesc.includes(keyword)) score += 2;
  }

  for (const pattern of (rule.description_patterns || []).map((item) => removeAccents(item.toLowerCase()))) {
    if (normalizedDesc.includes(pattern)) {
      score += 8;
      descriptionPatternHits.push(pattern);
    }
  }

  let productTypeMatch = false;
  if (rule.product_type && inferredType) {
    if (removeAccents(rule.product_type.toLowerCase()) === inferredType) {
      score += 15;
      productTypeMatch = true;
    }
  }

  let productFamilyMatch = false;
  if (rule.product_family && inferredFamily) {
    if (removeAccents(rule.product_family.toLowerCase()) === inferredFamily) {
      score += 5;
      productFamilyMatch = true;
    }
  }

  let presentationMatch = false;
  if (rule.presentation_type && inferredPresentation) {
    if (removeAccents(rule.presentation_type.toLowerCase()) === inferredPresentation) {
      score += 12;
      presentationMatch = true;
    } else {
      score -= 5;
    }
  }

  let groupMatch = false;
  if (rule.macro_group) {
    const ruleMacro = removeAccents(rule.macro_group.toLowerCase());
    if (ruleMacro === inferredMacro) {
      score += 8;
      groupMatch = true;
    }
    if (informedGroup && removeAccents(informedGroup.toLowerCase()) === ruleMacro) {
      score += 5;
      groupMatch = true;
    }
  }

  if (rule.subgroup && inferredSub) {
    if (removeAccents(rule.subgroup.toLowerCase()) === inferredSub) score += 6;
  }

  if (rule.data_origin === "imported") score += 3;
  score += Math.min(rule.priority, 20);

  return {
    rule,
    score,
    excludeHit,
    includeHits,
    descriptionPatternHits,
    productFamilyMatch,
    productTypeMatch,
    groupMatch,
    presentationMatch,
  };
}

function compareScoredRules(left: ScoredRule, right: ScoredRule): number {
  if (left.presentationMatch !== right.presentationMatch) return left.presentationMatch ? -1 : 1;
  if (left.productTypeMatch !== right.productTypeMatch) return left.productTypeMatch ? -1 : 1;
  if (left.groupMatch !== right.groupMatch) return left.groupMatch ? -1 : 1;
  if (right.includeHits.length !== left.includeHits.length) return right.includeHits.length - left.includeHits.length;
  if (right.descriptionPatternHits.length !== left.descriptionPatternHits.length) {
    return right.descriptionPatternHits.length - left.descriptionPatternHits.length;
  }
  if (right.score !== left.score) return right.score - left.score;
  return right.rule.priority - left.rule.priority;
}

function summarizeEvidence(rule: ScoredRule): RuleEvidenceSummary {
  const strongSignalCount = [
    rule.includeHits.length > 0,
    rule.descriptionPatternHits.length > 0,
    rule.productTypeMatch,
    rule.presentationMatch,
  ].filter(Boolean).length;

  const weakSignalCount = [
    rule.groupMatch,
    rule.productFamilyMatch,
  ].filter(Boolean).length;

  const semanticSignature = [
    rule.includeHits.length,
    rule.descriptionPatternHits.length,
    Number(rule.productTypeMatch),
    Number(rule.presentationMatch),
    Number(rule.groupMatch),
    Number(rule.productFamilyMatch),
  ].join("|");

  return {
    strongSignalCount,
    weakSignalCount,
    semanticSignature,
  };
}

function buildSelection(
  kind: "low_confidence" | "insufficient_rule",
  referenceRule: ScoredRule | undefined,
  confidenceScore: number,
  decisionReason: string,
  explanation: string,
): SafeRuleSelectionResult {
  return {
    kind,
    referenceRule,
    confidenceScore,
    decisionReason,
    explanation,
    legalBasisSummary: referenceRule?.rule.legal_basis_summary ||
      (kind === "insufficient_rule"
        ? "Nao ha regra exata suficiente para sustentar resposta segura."
        : "As regras exatas permaneceram ambiguas e exigem validacao manual."),
  };
}

export function selectSafeRuleCandidate(
  eligible: ScoredRule[],
  matchMode: RuleMatchMode,
): SafeRuleSelectionResult {
  const ranked = [...eligible].sort(compareScoredRules);
  const best = ranked[0];

  if (!best) {
    return buildSelection(
      matchMode === "prefix" ? "insufficient_rule" : "low_confidence",
      undefined,
      matchMode === "prefix" ? 0.12 : 0.28,
      "Nenhuma regra utilizavel permaneceu apos a triagem.",
      matchMode === "prefix"
        ? "Nao existe regra exata ativa para o NCM informado e o contexto por prefixo nao sustentou enquadramento utilizavel."
        : "As regras exatas encontradas nao permaneceram utilizaveis apos a triagem conservadora.",
    );
  }

  if (matchMode === "prefix") {
    return buildSelection(
      "insufficient_rule",
      best,
      0.18,
      "Nao ha regra exata ativa para o NCM informado; o prefixo foi mantido apenas como contexto.",
      "Foram encontradas regras por prefixo de NCM, mas o comparador conservador nao promove prefixo a resposta forte sem correspondencia exata.",
    );
  }

  const bestEvidence = summarizeEvidence(best);
  const runnerUp = ranked[1];
  if (!runnerUp) return { kind: "resolved", winner: best, decisionReason: best.rule.decision_reason || "" };

  if (bestEvidence.strongSignalCount === 0) {
    return buildSelection(
      "low_confidence",
      best,
      0.34,
      "NCM exato encontrado, mas faltou evidencia para diferenciar a regra com seguranca.",
      "Existem multiplas regras para o mesmo NCM exato e a descricao nao trouxe sinais fortes suficientes para sustentar resposta segura.",
    );
  }

  const runnerUpEvidence = summarizeEvidence(runnerUp);
  if (bestEvidence.semanticSignature === runnerUpEvidence.semanticSignature) {
    return buildSelection(
      "low_confidence",
      best,
      0.36,
      "Empate entre regras exatas com a mesma assinatura semantica.",
      "As regras exatas candidatas permaneceram empatadas em sinais semanticos e nao devem ser resolvidas apenas por prioridade ou ordem de entrada.",
    );
  }

  return { kind: "resolved", winner: best, decisionReason: best.rule.decision_reason || "" };
}
