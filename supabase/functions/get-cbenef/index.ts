import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import type { CbenefRuleVersion } from "./contract.ts";
import type { CbenefRule, ScoredRule } from "./engine.ts";
import { scoreRule, selectSafeRuleCandidate } from "./engine.ts";
import { buildLowConfidenceResponse, buildResolvedResponse } from "./response.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOISE_TOKENS = new Set([
  "promissao", "aurora", "tirolez", "frizzo", "criolo", "santo", "antonio", "parmalat",
  "nestle", "danone", "elegante", "italac", "piracanjuba", "vigor", "presidente",
  "pote", "pct", "pct.", "pcts", "un", "und", "unid", "cx", "cxa", "caixa", "kg", "gr", "g",
  "ml", "lt", "lts", "litro", "litros",
  "100", "150", "200", "250", "300", "400", "500", "600", "750", "1000",
  "de", "do", "da", "com", "sem", "para", "em", "no", "na", "os", "as", "ao", "pela", "pelo",
]);

function removeAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeDescription(raw: string) {
  const lower = removeAccents(raw.toLowerCase().trim());
  const clean = lower.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const allTokens = clean.split(" ").filter((token) => token.length > 0);
  const strong: string[] = [];
  const noise: string[] = [];

  for (const token of allTokens) {
    if (NOISE_TOKENS.has(token) || /^\d+$/.test(token)) noise.push(token);
    else strong.push(token);
  }

  return {
    normalized_description: clean,
    normalized_tokens: allTokens,
    strong_tokens: strong,
    commercial_noise_tokens: noise,
  };
}

interface TaxonomyEntry {
  macro_code: string;
  sub_code: string | null;
  keyword: string;
  match_type: string;
  weight: number;
}

interface ClassificationGroupRow {
  id: string;
  code: string;
  parent_id: string | null;
}

interface ClassificationKeywordRow {
  group_id: string;
  keyword: string;
  match_type: string;
  weight: number;
}

async function loadTaxonomy(supabase: any): Promise<TaxonomyEntry[]> {
  const { data: groups } = await supabase
    .from("classification_groups")
    .select("id, code, parent_id, level")
    .eq("is_active", true);

  const typedGroups = (groups || []) as ClassificationGroupRow[];
  if (typedGroups.length === 0) return [];

  const idToCode: Record<string, string> = {};
  const idToParent: Record<string, string | null> = {};

  for (const group of typedGroups) {
    idToCode[group.id] = group.code;
    idToParent[group.id] = group.parent_id;
  }

  const { data: keywords } = await supabase
    .from("classification_group_keywords")
    .select("group_id, keyword, match_type, weight");

  const typedKeywords = (keywords || []) as ClassificationKeywordRow[];
  if (typedKeywords.length === 0) return [];

  const entries: TaxonomyEntry[] = [];
  for (const keyword of typedKeywords) {
    const groupCode = idToCode[keyword.group_id];
    if (!groupCode) continue;

    const parentId = idToParent[keyword.group_id];
    let macroCode: string;
    let subCode: string | null = null;

    if (parentId && idToCode[parentId]) {
      macroCode = idToCode[parentId];
      subCode = groupCode;
    } else {
      macroCode = groupCode;
    }

    entries.push({
      macro_code: macroCode,
      sub_code: subCode,
      keyword: removeAccents(keyword.keyword.toLowerCase()),
      match_type: keyword.match_type,
      weight: keyword.weight,
    });
  }

  return entries;
}

function inferGroupFromTaxonomy(
  strongTokens: string[],
  normalizedDescription: string,
  taxonomy: TaxonomyEntry[],
): { inferred_macro_group: string; inferred_subgroup: string; best_score: number } {
  const scores: Record<string, { macro: string; sub: string; score: number }> = {};

  for (const entry of taxonomy) {
    if (entry.match_type !== "include") continue;

    const parts = entry.keyword.split(" ");
    let hit = false;

    if (parts.length > 1) {
      if (parts.every((part) => strongTokens.includes(part)) || normalizedDescription.includes(entry.keyword)) {
        hit = true;
      }
    } else if (strongTokens.includes(entry.keyword) || normalizedDescription.includes(entry.keyword)) {
      hit = true;
    }

    if (!hit) continue;

    const key = entry.sub_code || entry.macro_code;
    if (!scores[key]) {
      scores[key] = { macro: entry.macro_code, sub: entry.sub_code || "", score: 0 };
    }

    scores[key].score += 10 * entry.weight;
  }

  let best = { inferred_macro_group: "", inferred_subgroup: "", best_score: 0 };
  for (const value of Object.values(scores)) {
    if (value.score > best.best_score) {
      best = {
        inferred_macro_group: value.macro,
        inferred_subgroup: value.sub,
        best_score: value.score,
      };
    }
  }

  return best;
}

function inferProductClassification(strongTokens: string[]) {
  const joined = strongTokens.join(" ");
  let family = "";
  let type = "";
  let presentation = "";

  const cheeseTypes: Record<string, string[]> = {
    mussarela: ["mussarela", "mucarela", "mucarel", "mussarel"],
    prato: ["queijo prato"],
    provolone: ["provolone"],
    coalho: ["coalho", "queijo coalho"],
    minas_frescal: ["minas frescal", "minas", "frescal"],
    queijo_ralado: ["queijo ralado"],
  };

  for (const [detectedType, keywords] of Object.entries(cheeseTypes)) {
    if (keywords.some((keyword) =>
      joined.includes(keyword) || keyword.split(" ").every((part) => strongTokens.includes(part))
    )) {
      family = "queijos";
      type = detectedType;
      break;
    }
  }

  if (!family) {
    const dairyTypes: Record<string, string[]> = {
      manteiga: ["manteiga"],
      requeijao: ["requeijao"],
      ricota: ["ricota"],
      iogurte: ["iogurte", "yogurte"],
      leite: ["leite"],
      creme_de_leite: ["creme leite"],
      nata: ["nata"],
      leite_condensado: ["leite condensado"],
    };

    for (const [detectedType, keywords] of Object.entries(dairyTypes)) {
      if (keywords.some((keyword) =>
        joined.includes(keyword) || keyword.split(" ").every((part) => strongTokens.includes(part))
      )) {
        family = "laticinios";
        type = detectedType;
        break;
      }
    }
  }

  if (!family) {
    const meatKeywords: Record<string, { family: string; keywords: string[] }> = {
      bovino: {
        family: "carnes_bovinas",
        keywords: ["alcatra", "picanha", "patinho", "file mignon", "acem", "coxao", "maminha", "fraldinha", "lagarto", "musculo", "costela bovina", "charque", "carne seca", "carne sol"],
      },
      suino: {
        family: "carnes_suinas",
        keywords: ["pernil", "lombo suino", "bisteca suina", "costela suina", "bacon", "toucinho", "panceta"],
      },
      frango: {
        family: "aves",
        keywords: ["frango", "coxa", "sobrecoxa", "asa", "peito frango", "sassami", "moela", "coracao frango"],
      },
      peixe: {
        family: "pescados",
        keywords: ["tilapia", "merluza", "sardinha", "salmao", "bacalhau", "corvina", "peixe", "file peixe"],
      },
    };

    for (const [detectedType, config] of Object.entries(meatKeywords)) {
      if (config.keywords.some((keyword) => joined.includes(keyword))) {
        family = config.family;
        type = detectedType;
        break;
      }
    }
  }

  const presentations: Record<string, string[]> = {
    fatiada: ["fatiada", "fatiado", "fatia", "fatiados"],
    pedaco: ["pedaco", "peca", "inteiro", "inteira", "bloco"],
    ralado: ["ralado", "ralada"],
    pote: ["pote"],
    tablete: ["tablete", "tabletes", "barra"],
    banda: ["banda"],
  };

  for (const [detectedPresentation, keywords] of Object.entries(presentations)) {
    if (keywords.some((keyword) => strongTokens.includes(keyword))) {
      presentation = detectedPresentation;
      break;
    }
  }

  if (!presentation && type) presentation = "padrao";
  if (!family && !type) {
    family = "nao_identificado";
    type = "nao_identificado";
  }

  return { product_family: family, product_type: type, presentation_type: presentation };
}

function isDescriptionInsufficient(strongTokens: string[]): boolean {
  if (strongTokens.length < 2) return true;

  const generic = new Set([
    "produto",
    "alimenticio",
    "alimento",
    "item",
    "mercadoria",
    "material",
    "laticinio",
    "laticinios",
    "carne",
    "peixe",
    "queijo",
    "mercearia",
  ]);

  const nonGeneric = strongTokens.filter((token) => !generic.has(token));
  return nonGeneric.length < 1;
}

function collectExcludedKeywordHits(
  excludedRules: ScoredRule[],
  normalized: ReturnType<typeof normalizeDescription>,
): string[] {
  return excludedRules
    .map((entry) => (entry.rule.keyword_exclude || []).filter((keyword) => {
      const normalizedKeyword = removeAccents(keyword.toLowerCase());
      return normalized.strong_tokens.includes(normalizedKeyword) || normalized.normalized_description.includes(normalizedKeyword);
    }))
    .flat();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (!body.ncm || !body.ncm.trim()) {
      return jsonResponse({ error: "NCM e obrigatorio" }, 400);
    }

    if (!body.descricao || !body.descricao.trim()) {
      return jsonResponse({ error: "Descricao do produto e obrigatoria" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ncm = body.ncm.replace(/[^0-9]/g, "");
    const informedCst = body.cst_icms ? body.cst_icms.replace(/[^0-9]/g, "") : null;
    const informedGroup: string | null = body.grupo || null;

    const normalized = normalizeDescription(body.descricao);
    const classification = inferProductClassification(normalized.strong_tokens);

    const taxonomy = await loadTaxonomy(supabase);
    const groupInference = inferGroupFromTaxonomy(
      normalized.strong_tokens,
      normalized.normalized_description,
      taxonomy,
    );

    const descriptionInsufficient = isDescriptionInsufficient(normalized.strong_tokens);

    let groupConsistency = "ok";
    if (informedGroup && groupInference.inferred_macro_group && informedGroup !== groupInference.inferred_macro_group) {
      groupConsistency = "divergente";
    } else if (informedGroup && informedGroup === groupInference.inferred_macro_group) {
      groupConsistency = "coerente";
    } else if (!informedGroup && groupInference.inferred_macro_group) {
      groupConsistency = "inferido";
    } else if (!informedGroup && !groupInference.inferred_macro_group) {
      groupConsistency = "nao_identificado";
    }

    let matchedByNcmExact = false;
    let matchedByNcmPrefix = false;
    let matchedBy = "";

    let { data: rules } = await supabase
      .from("cbenef_rules")
      .select("*")
      .eq("ncm", ncm)
      .eq("is_active", true);

    if (rules && rules.length > 0) {
      matchedByNcmExact = true;
      matchedBy = "ncm_exato";
    }

    if (!rules || rules.length === 0) {
      for (const prefix of [ncm.slice(0, 6), ncm.slice(0, 4), ncm.slice(0, 2)]) {
        const { data } = await supabase
          .from("cbenef_rules")
          .select("*")
          .like("ncm", `${prefix}%`)
          .eq("is_active", true);

        if (data && data.length > 0) {
          rules = data;
          matchedByNcmPrefix = true;
          matchedBy = "ncm_prefixo";
          break;
        }
      }
    }

    if (!rules || rules.length === 0) {
      await supabase.from("query_logs").insert({
        ean: body.ean || null,
        description: body.descricao || null,
        ncm,
        cst_icms: informedCst || null,
        brand: body.marca || null,
        suggested_cbenef: null,
        confidence_score: 0,
        matched_by: "none",
      });

      return jsonResponse(buildLowConfidenceResponse({
        ncm,
        informedCst,
        normalizedDescription: normalized.normalized_description,
        classification,
        groupInference,
        informedGroup,
        legalBasisSummary: "Nenhuma regra encontrada para o NCM informado.",
        explanation: "Nao foi possivel encontrar uma regra correspondente para o NCM informado na base atual.",
        decisionReason: "Nenhuma regra encontrada.",
      }));
    }

    const scored: ScoredRule[] = (rules as CbenefRule[]).map((rule) =>
      scoreRule(
        rule,
        normalized.strong_tokens,
        normalized.normalized_description,
        classification.product_type,
        classification.product_family,
        classification.presentation_type,
        groupInference.inferred_macro_group,
        groupInference.inferred_subgroup,
        informedGroup,
      )
    );

    const eligible = scored.filter((entry) => !entry.excludeHit);
    const excludedRules = scored.filter((entry) => entry.excludeHit);
    const excludedKeywordHits = collectExcludedKeywordHits(excludedRules, normalized);

    if (eligible.length === 0) {
      await supabase.from("query_logs").insert({
        ean: body.ean || null,
        description: body.descricao || null,
        ncm,
        cst_icms: informedCst || null,
        brand: body.marca || null,
        suggested_cbenef: null,
        confidence_score: 0.1,
        matched_by: "excluded_by_keywords",
      });

      return jsonResponse(buildLowConfidenceResponse({
        ncm,
        informedCst,
        normalizedDescription: normalized.normalized_description,
        classification,
        groupInference,
        informedGroup,
        confidenceScore: 0.1,
        explanation: "As regras encontradas para este NCM foram eliminadas por conflito de palavras-chave com a descricao informada.",
        excludedKeywordsHit: excludedKeywordHits,
        decisionReason: "Regras eliminadas por keyword_exclude.",
        matchedByNcmExact,
        matchedByNcmPrefix,
      }));
    }

    const safeSelection = selectSafeRuleCandidate(eligible, matchedByNcmPrefix);

    if (safeSelection.kind === "low_confidence") {
      await supabase.from("query_logs").insert({
        ean: body.ean || null,
        description: body.descricao || null,
        ncm,
        cst_icms: informedCst || null,
        brand: body.marca || null,
        suggested_cbenef: null,
        confidence_score: safeSelection.confidenceScore ?? 0.24,
        matched_by: matchedBy ? `${matchedBy}+selecao_segura` : "selecao_segura",
      });

      return jsonResponse(buildLowConfidenceResponse({
        ncm,
        informedCst,
        normalizedDescription: normalized.normalized_description,
        classification,
        groupInference,
        informedGroup,
        confidenceScore: safeSelection.confidenceScore,
        legalBasisSummary: safeSelection.legalBasisSummary,
        explanation: safeSelection.explanation,
        decisionReason: safeSelection.decisionReason,
        matchedByNcmExact,
        matchedByNcmPrefix,
        excludedKeywordsHit: excludedKeywordHits,
      }));
    }

    const best = safeSelection.winner!;
    const bestRule = best.rule;

    let cstSource: "informado" | "sugerido" | "ajustado" = "sugerido";
    let finalCst = "";
    let cstWarning = "";
    let usedInformedCst = false;
    let autoSuggestedCst = false;

    const ruleCst = bestRule.output_cst_icms || bestRule.suggested_cst_icms || bestRule.cst_icms || "";

    if (informedCst) {
      if (informedCst === ruleCst || informedCst === bestRule.cst_icms) {
        cstSource = "informado";
        finalCst = informedCst;
        usedInformedCst = true;
        matchedBy += "+cst_informado";
      } else {
        cstSource = "ajustado";
        finalCst = ruleCst;
        cstWarning =
          `O CST informado (${informedCst}) diverge do esperado (${ruleCst}) para este tipo de produto. ` +
          "O sistema utilizou o CST da regra identificada.";
        matchedBy += "+cst_ajustado";
      }
    } else {
      finalCst = ruleCst;
      autoSuggestedCst = true;
      matchedBy += "+cst_sugerido";
    }

    let confidence = 0;
    if (matchedByNcmExact) confidence += 0.25;
    else confidence += 0.10;

    if (best.productTypeMatch) confidence += 0.25;
    else if (best.includeHits.length > 0) confidence += 0.15;

    if (best.presentationMatch) confidence += 0.10;

    if (best.includeHits.length >= 3) confidence += 0.20;
    else if (best.includeHits.length >= 2) confidence += 0.15;
    else if (best.includeHits.length >= 1) confidence += 0.10;

    if (cstSource === "informado") confidence += 0.10;
    else if (cstSource === "sugerido" && ruleCst) confidence += 0.07;
    else if (cstSource === "ajustado") confidence += 0.03;

    if (bestRule.legal_basis_name && bestRule.legal_basis_summary) confidence += 0.05;

    if (bestRule.priority >= 15) confidence += 0.10;
    else if (bestRule.priority >= 10) confidence += 0.07;
    else if (bestRule.priority >= 5) confidence += 0.04;

    if (bestRule.data_origin === "imported") confidence += 0.05;
    if (best.groupMatch) confidence += 0.05;
    if (groupConsistency === "coerente") confidence += 0.03;

    if (descriptionInsufficient) {
      confidence = Math.min(confidence, 0.55);
      cstWarning = (cstWarning ? `${cstWarning} ` : "") +
        "A descricao informada e insuficiente para diferenciar corretamente o tipo fiscal do item. Informe uma descricao mais especifica.";
    }

    if (groupConsistency === "divergente") {
      confidence -= 0.05;
      cstWarning = (cstWarning ? `${cstWarning} ` : "") +
        "O grupo informado nao parece compativel com a descricao do item. A classificacao foi priorizada com base no NCM e na descricao normalizada.";
    }

    if (
      classification.product_type !== "nao_identificado" &&
      bestRule.product_type &&
      removeAccents(bestRule.product_type.toLowerCase()) !== classification.product_type
    ) {
      confidence -= 0.15;
      cstWarning = (cstWarning ? `${cstWarning} ` : "") +
        `Possivel conflito: o NCM aponta para "${bestRule.product_type}" mas a descricao sugere "${classification.product_type}".`;
    }

    confidence = Math.max(0, Math.min(confidence, 1));
    confidence = Math.round(confidence * 100) / 100;

    const confidenceLevel = confidence >= 0.85 ? "high" : confidence >= 0.65 ? "medium" : "low";

    const decisionReason = bestRule.decision_reason ||
      (best.productTypeMatch
        ? `Produto identificado como "${classification.product_type}" pela descricao normalizada, compativel com a regra.`
        : "Regra selecionada por aderencia de palavras-chave e prioridade.");

    let explanation = "";
    if (confidenceLevel === "high") {
      explanation = `Classificacao com alta confianca. ${decisionReason}`;
    } else if (confidenceLevel === "medium") {
      explanation = `Classificacao com confianca media. ${decisionReason} Recomenda-se validacao.`;
    } else {
      explanation = `Confianca insuficiente para classificacao segura. ${decisionReason}`;
    }

    let ruleVersion: CbenefRuleVersion | null = null;
    if (bestRule.rule_version_id) {
      const { data: ruleVersionRow } = await supabase
        .from("rule_versions")
        .select("version_label, version_code, published_at, created_at")
        .eq("id", bestRule.rule_version_id)
        .single();

      if (ruleVersionRow) {
        ruleVersion = {
          version_label: ruleVersionRow.version_label,
          version_code: ruleVersionRow.version_code,
          published_at: ruleVersionRow.published_at || ruleVersionRow.created_at,
        };
      }
    }

    await supabase.from("query_logs").insert({
      ean: body.ean || null,
      description: body.descricao || null,
      ncm,
      cst_icms: informedCst || finalCst,
      brand: body.marca || null,
      suggested_cbenef: confidenceLevel !== "low" ? bestRule.cbenef_code : null,
      confidence_score: confidence,
      rule_id: bestRule.id,
      matched_by: matchedBy,
    });

    return jsonResponse(buildResolvedResponse({
      bestRule,
      informedCst,
      finalCst,
      cstSource,
      cstWarning,
      confidence,
      confidenceLevel,
      ruleVersion,
      ncm,
      explanation,
      matchedByNcmExact,
      matchedByNcmPrefix,
      keywordMatchCount: best.includeHits.length,
      usedInformedCst,
      autoSuggestedCst,
      normalizedDescription: normalized.normalized_description,
      matchedKeywords: best.includeHits,
      excludedKeywordsHit: excludedKeywordHits,
      groupInference,
      informedGroup,
      groupConsistency,
      classification,
      decisionReason,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
