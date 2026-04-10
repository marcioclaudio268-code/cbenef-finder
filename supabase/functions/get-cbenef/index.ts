import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Commercial noise tokens (ignored for fiscal classification) ──
const NOISE_TOKENS = new Set([
  "promissao","aurora","tirolez","frizzo","criolo","santo","antonio","parmalat",
  "nestle","danone","elegante","italac","piracanjuba","vigor","presidente",
  "pote","pct","pct.","pcts","un","und","unid","cx","cxa","caixa","kg","gr","g",
  "ml","lt","lts","litro","litros",
  "100","150","200","250","300","400","500","600","750","1000",
  "de","do","da","com","sem","para","em","no","na","os","as","ao","pela","pelo",
]);

// ── Normalization ──
function removeAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeDescription(raw: string) {
  const lower = removeAccents(raw.toLowerCase().trim());
  const clean = lower.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const allTokens = clean.split(" ").filter(t => t.length > 0);
  const strong: string[] = [];
  const noise: string[] = [];
  for (const t of allTokens) {
    if (NOISE_TOKENS.has(t) || /^\d+$/.test(t)) noise.push(t);
    else strong.push(t);
  }
  return { normalized_description: clean, normalized_tokens: allTokens, strong_tokens: strong, commercial_noise_tokens: noise };
}

// ── Load taxonomy from DB ──
interface TaxonomyEntry {
  macro_code: string;
  sub_code: string | null;
  keyword: string;
  match_type: string;
  weight: number;
}

async function loadTaxonomy(supabase: ReturnType<typeof createClient>): Promise<TaxonomyEntry[]> {
  // Load macro groups
  const { data: groups } = await supabase
    .from("classification_groups")
    .select("id, code, parent_id, level")
    .eq("is_active", true);

  if (!groups || groups.length === 0) return [];

  // Build parent lookup
  const idToCode: Record<string, string> = {};
  const idToParent: Record<string, string | null> = {};
  for (const g of groups) {
    idToCode[g.id] = g.code;
    idToParent[g.id] = g.parent_id;
  }

  // Load keywords
  const { data: keywords } = await supabase
    .from("classification_group_keywords")
    .select("group_id, keyword, match_type, weight");

  if (!keywords || keywords.length === 0) return [];

  const entries: TaxonomyEntry[] = [];
  for (const kw of keywords) {
    const groupCode = idToCode[kw.group_id];
    if (!groupCode) continue;
    const parentId = idToParent[kw.group_id];
    // Determine if this is a macro or sub group
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
      keyword: removeAccents(kw.keyword.toLowerCase()),
      match_type: kw.match_type,
      weight: kw.weight,
    });
  }
  return entries;
}

// ── Infer macro_group + subgroup from description using DB taxonomy ──
function inferGroupFromTaxonomy(
  strongTokens: string[],
  normalizedDesc: string,
  taxonomy: TaxonomyEntry[]
): { inferred_macro_group: string; inferred_subgroup: string; best_score: number } {
  const scores: Record<string, { macro: string; sub: string; score: number }> = {};

  for (const entry of taxonomy) {
    if (entry.match_type !== "include") continue;
    const parts = entry.keyword.split(" ");
    let hit = false;
    if (parts.length > 1) {
      if (parts.every(p => strongTokens.includes(p)) || normalizedDesc.includes(entry.keyword)) hit = true;
    } else {
      if (strongTokens.includes(entry.keyword) || normalizedDesc.includes(entry.keyword)) hit = true;
    }
    if (!hit) continue;

    const key = entry.sub_code || entry.macro_code;
    if (!scores[key]) scores[key] = { macro: entry.macro_code, sub: entry.sub_code || "", score: 0 };
    scores[key].score += 10 * entry.weight;
  }

  let best = { inferred_macro_group: "", inferred_subgroup: "", best_score: 0 };
  for (const v of Object.values(scores)) {
    if (v.score > best.best_score) {
      best = { inferred_macro_group: v.macro, inferred_subgroup: v.sub, best_score: v.score };
    }
  }
  return best;
}

// ── Infer product classification from strong tokens ──
function inferProductClassification(strongTokens: string[]) {
  const joined = strongTokens.join(" ");
  let family = "", type = "", presentation = "";

  // Queijos (own macro_group)
  const cheeseTypes: Record<string, string[]> = {
    mussarela: ["mussarela","mucarela","mucarel","mussarel"],
    prato: ["queijo prato"],
    provolone: ["provolone"],
    coalho: ["coalho","queijo coalho"],
    minas_frescal: ["minas frescal","minas","frescal"],
    queijo_ralado: ["queijo ralado"],
  };
  for (const [dtype, kws] of Object.entries(cheeseTypes)) {
    if (kws.some(k => joined.includes(k) || strongTokens.some(t => k.split(" ").every(kp => strongTokens.includes(kp))))) {
      family = "queijos"; type = dtype; break;
    }
  }

  // Laticínios
  if (!family) {
    const dairyTypes: Record<string, string[]> = {
      manteiga: ["manteiga"],
      requeijao: ["requeijao"],
      ricota: ["ricota"],
      iogurte: ["iogurte","yogurte"],
      leite: ["leite"],
      creme_de_leite: ["creme leite"],
      nata: ["nata"],
      leite_condensado: ["leite condensado"],
    };
    for (const [dtype, kws] of Object.entries(dairyTypes)) {
      if (kws.some(k => joined.includes(k) || strongTokens.some(t => k.split(" ").every(kp => strongTokens.includes(kp))))) {
        family = "laticinios"; type = dtype; break;
      }
    }
  }

  // Meat types
  if (!family) {
    const meatKw: Record<string, { family: string; kws: string[] }> = {
      bovino: { family: "carnes_bovinas", kws: ["alcatra","picanha","patinho","file mignon","acem","coxao","maminha","fraldinha","lagarto","musculo","costela bovina","charque","carne seca","carne sol"] },
      suino: { family: "carnes_suinas", kws: ["pernil","lombo suino","bisteca suina","costela suina","bacon","toucinho","panceta"] },
      frango: { family: "aves", kws: ["frango","coxa","sobrecoxa","asa","peito frango","sassami","moela","coracao frango"] },
      peixe: { family: "pescados", kws: ["tilapia","merluza","sardinha","salmao","bacalhau","corvina","peixe","file peixe"] },
    };
    for (const [mtype, cfg] of Object.entries(meatKw)) {
      if (cfg.kws.some(k => joined.includes(k))) { family = cfg.family; type = mtype; break; }
    }
  }

  const presentations: Record<string, string[]> = {
    fatiada: ["fatiada","fatiado","fatia","fatiados"],
    pedaco: ["pedaco","peca","inteiro","inteira","bloco"],
    ralado: ["ralado","ralada"],
    pote: ["pote"],
    tablete: ["tablete","tabletes","barra"],
    banda: ["banda"],
  };
  for (const [ptype, kws] of Object.entries(presentations)) {
    if (kws.some(k => strongTokens.includes(k))) { presentation = ptype; break; }
  }
  if (!presentation && type) presentation = "padrao";
  if (!family && !type) { family = "nao_identificado"; type = "nao_identificado"; }
  return { product_family: family, product_type: type, presentation_type: presentation };
}

// ── Rule interface ──
interface CbenefRule {
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

interface ScoredRule {
  rule: CbenefRule;
  score: number;
  excludeHit: boolean;
  includeHits: string[];
  productTypeMatch: boolean;
  groupMatch: boolean;
  presentationMatch: boolean;
}

function scoreRule(
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

  // keyword_exclude: hard filter
  const kwExclude = (rule.keyword_exclude || []).map(k => removeAccents(k.toLowerCase()));
  for (const ex of kwExclude) {
    if (strongTokens.includes(ex) || normalizedDesc.includes(ex)) excludeHit = true;
  }

  // keyword_include: strong boost
  const kwInclude = (rule.keyword_include || []).map(k => removeAccents(k.toLowerCase()));
  for (const inc of kwInclude) {
    const parts = inc.split(" ");
    if (parts.length > 1) {
      if (parts.every(p => strongTokens.includes(p) || normalizedDesc.includes(p))) { score += 10; includeHits.push(inc); }
    } else if (strongTokens.includes(inc) || normalizedDesc.includes(inc)) { score += 10; includeHits.push(inc); }
  }

  // Legacy keywords
  for (const kw of (rule.keywords || []).map(k => removeAccents(k.toLowerCase()))) {
    if (strongTokens.includes(kw) || normalizedDesc.includes(kw)) score += 2;
  }

  // description_patterns
  for (const pat of (rule.description_patterns || []).map(p => removeAccents(p.toLowerCase()))) {
    if (normalizedDesc.includes(pat)) score += 8;
  }

  // product_type coherence
  let productTypeMatch = false;
  if (rule.product_type && inferredType) {
    if (removeAccents(rule.product_type.toLowerCase()) === inferredType) { score += 15; productTypeMatch = true; }
  }
  if (rule.product_family && inferredFamily) {
    if (removeAccents(rule.product_family.toLowerCase()) === inferredFamily) score += 5;
  }

  // presentation_type match
  let presentationMatch = false;
  if (rule.presentation_type && inferredPresentation) {
    if (removeAccents(rule.presentation_type.toLowerCase()) === inferredPresentation) { score += 12; presentationMatch = true; }
    else { score -= 5; } // penalize presentation mismatch
  }

  // ── Group match (macro_group/subgroup) ──
  let groupMatch = false;
  if (rule.macro_group) {
    const ruleMacro = removeAccents(rule.macro_group.toLowerCase());
    if (ruleMacro === inferredMacro) { score += 8; groupMatch = true; }
    if (informedGroup && removeAccents(informedGroup.toLowerCase()) === ruleMacro) { score += 5; groupMatch = true; }
  }
  if (rule.subgroup && inferredSub) {
    if (removeAccents(rule.subgroup.toLowerCase()) === inferredSub) score += 6;
  }

  // data_origin bonus
  if (rule.data_origin === "imported") score += 3;
  // priority
  score += Math.min(rule.priority, 20);

  return { rule, score, excludeHit, includeHits, productTypeMatch, groupMatch, presentationMatch };
}

function isDescriptionInsufficient(strongTokens: string[]): boolean {
  if (strongTokens.length < 2) return true;
  const generic = new Set(["produto","alimenticio","alimento","item","mercadoria","material","laticinio","laticinios","carne","peixe","queijo","mercearia"]);
  const nonGeneric = strongTokens.filter(t => !generic.has(t));
  return nonGeneric.length < 1;
}

function buildLowConfidenceResponse(
  ncm: string, informedCst: string | null, norm: ReturnType<typeof normalizeDescription>,
  classification: ReturnType<typeof inferProductClassification>,
  groupInference: { inferred_macro_group: string; inferred_subgroup: string },
  informedGroup: string | null,
  extra: Record<string, unknown> = {}
) {
  return {
    cbenef_code: "", informed_cst_icms: informedCst || "",
    suggested_cst_icms: "", final_cst_icms: "", cst_source: "none",
    confidence_score: extra.confidence_score ?? 0, confidence_level: "low",
    matched_rule_id: null,
    application_context: "Operação interna — Estado de São Paulo",
    legal_basis_name: "", legal_basis_summary: extra.legal_basis_summary ?? "",
    legal_basis_url: null, rule_version: null,
    last_updated_at: new Date().toISOString(),
    input_ncm: ncm, matched_ncm: "",
    explanation: extra.explanation ?? "",
    matched_by_ncm_exact: extra.matched_by_ncm_exact ?? false,
    matched_by_ncm_prefix: extra.matched_by_ncm_prefix ?? false,
    keyword_match_count: 0, used_informed_cst: false, auto_suggested_cst: false,
    data_origin: "",
    normalized_description: norm.normalized_description,
    matched_keywords: [], excluded_keywords_hit: extra.excluded_keywords_hit ?? [],
    inferred_macro_group: groupInference.inferred_macro_group,
    inferred_subgroup: groupInference.inferred_subgroup,
    informed_group: informedGroup || "",
    group_consistency_status: "",
    product_family: classification.product_family,
    product_type: classification.product_type,
    presentation_type: classification.presentation_type,
    output_st_applicable: null, output_cfop: "",
    decision_reason: extra.decision_reason ?? "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (!body.ncm || !body.ncm.trim()) {
      return new Response(JSON.stringify({ error: "NCM é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!body.descricao || !body.descricao.trim()) {
      return new Response(JSON.stringify({ error: "Descrição do produto é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const ncm = body.ncm.replace(/[^0-9]/g, "");
    const informedCst = body.cst_icms ? body.cst_icms.replace(/[^0-9]/g, "") : null;
    const informedGroup: string | null = body.grupo || null;

    // ── B. Normalization ──
    const norm = normalizeDescription(body.descricao);
    const classification = inferProductClassification(norm.strong_tokens);

    // ── Load taxonomy from DB and infer group ──
    const taxonomy = await loadTaxonomy(supabase);
    const groupInference = inferGroupFromTaxonomy(norm.strong_tokens, norm.normalized_description, taxonomy);

    const descInsufficient = isDescriptionInsufficient(norm.strong_tokens);

    // ── Group consistency ──
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

    // ── C. NCM pre-filter ──
    let matchedByNcmExact = false;
    let matchedByNcmPrefix = false;
    let matchedBy = "";

    let { data: rules } = await supabase
      .from("cbenef_rules").select("*").eq("ncm", ncm).eq("is_active", true);

    if (rules && rules.length > 0) { matchedByNcmExact = true; matchedBy = "ncm_exato"; }

    if (!rules || rules.length === 0) {
      for (const prefix of [ncm.slice(0, 6), ncm.slice(0, 4), ncm.slice(0, 2)]) {
        const { data } = await supabase.from("cbenef_rules").select("*").like("ncm", `${prefix}%`).eq("is_active", true);
        if (data && data.length > 0) { rules = data; matchedByNcmPrefix = true; matchedBy = "ncm_prefixo"; break; }
      }
    }

    if (!rules || rules.length === 0) {
      await supabase.from("query_logs").insert({
        ean: body.ean || null, description: body.descricao || null,
        ncm, cst_icms: informedCst || null, brand: body.marca || null,
        suggested_cbenef: null, confidence_score: 0, matched_by: "none",
      });
      return new Response(JSON.stringify(buildLowConfidenceResponse(ncm, informedCst, norm, classification, groupInference, informedGroup, {
        legal_basis_summary: "Nenhuma regra encontrada para o NCM informado.",
        explanation: "Não foi possível encontrar uma regra correspondente para o NCM informado na base atual.",
        decision_reason: "Nenhuma regra encontrada.",
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── D+E. Score all rules ──
    const scored: ScoredRule[] = (rules as CbenefRule[]).map(r =>
      scoreRule(r, norm.strong_tokens, norm.normalized_description, classification.product_type, classification.product_family,
        classification.presentation_type, groupInference.inferred_macro_group, groupInference.inferred_subgroup, informedGroup)
    );

    const eligible = scored.filter(s => !s.excludeHit);
    const excludedRules = scored.filter(s => s.excludeHit);

    if (eligible.length === 0) {
      await supabase.from("query_logs").insert({
        ean: body.ean || null, description: body.descricao || null,
        ncm, cst_icms: informedCst || null, brand: body.marca || null,
        suggested_cbenef: null, confidence_score: 0.1, matched_by: "excluded_by_keywords",
      });
      return new Response(JSON.stringify(buildLowConfidenceResponse(ncm, informedCst, norm, classification, groupInference, informedGroup, {
        confidence_score: 0.1,
        explanation: "As regras encontradas para este NCM foram eliminadas por conflito de palavras-chave com a descrição informada.",
        excluded_keywords_hit: excludedRules.flatMap(e => (e.rule.keyword_exclude || [])),
        decision_reason: "Regras eliminadas por keyword_exclude.",
        matched_by_ncm_exact: matchedByNcmExact, matched_by_ncm_prefix: matchedByNcmPrefix,
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Ranking: presentationMatch > productTypeMatch > groupMatch > includeHits > score > priority ──
    eligible.sort((a, b) => {
      if (a.presentationMatch !== b.presentationMatch) return a.presentationMatch ? -1 : 1;
      if (a.productTypeMatch !== b.productTypeMatch) return a.productTypeMatch ? -1 : 1;
      if (a.groupMatch !== b.groupMatch) return a.groupMatch ? -1 : 1;
      if (b.includeHits.length !== a.includeHits.length) return b.includeHits.length - a.includeHits.length;
      if (b.score !== a.score) return b.score - a.score;
      return b.rule.priority - a.rule.priority;
    });

    const best = eligible[0];
    const bestRule = best.rule;

    // ── F. CST determination ──
    let cstSource: "informado" | "sugerido" | "ajustado" = "sugerido";
    let finalCst = "";
    let cstWarning = "";
    let usedInformedCst = false;
    let autoSuggestedCst = false;

    const ruleCst = bestRule.output_cst_icms || bestRule.suggested_cst_icms || bestRule.cst_icms || "";

    if (informedCst) {
      if (informedCst === ruleCst || informedCst === bestRule.cst_icms) {
        cstSource = "informado"; finalCst = informedCst; usedInformedCst = true; matchedBy += "+cst_informado";
      } else {
        cstSource = "ajustado"; finalCst = ruleCst;
        cstWarning = `O CST informado (${informedCst}) diverge do esperado (${ruleCst}) para este tipo de produto. O sistema utilizou o CST da regra identificada.`;
        matchedBy += "+cst_ajustado";
      }
    } else {
      finalCst = ruleCst; autoSuggestedCst = true; matchedBy += "+cst_sugerido";
    }

    // ── Confidence scoring ──
    let confidence = 0;
    if (matchedByNcmExact) confidence += 0.25; else confidence += 0.10;
    if (best.productTypeMatch) confidence += 0.25; else if (best.includeHits.length > 0) confidence += 0.15;
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

    // Penalties
    if (descInsufficient) {
      confidence = Math.min(confidence, 0.55);
      cstWarning = (cstWarning ? cstWarning + " " : "") +
        "A descrição informada é insuficiente para diferenciar corretamente o tipo fiscal do item. Informe uma descrição mais específica.";
    }
    if (groupConsistency === "divergente") {
      confidence -= 0.05;
      cstWarning = (cstWarning ? cstWarning + " " : "") +
        "O grupo informado não parece compatível com a descrição do item. A classificação foi priorizada com base no NCM e na descrição normalizada.";
    }
    if (classification.product_type !== "nao_identificado" && bestRule.product_type &&
        removeAccents(bestRule.product_type.toLowerCase()) !== classification.product_type) {
      confidence -= 0.15;
      cstWarning = (cstWarning ? cstWarning + " " : "") +
        `Possível conflito: o NCM aponta para "${bestRule.product_type}" mas a descrição sugere "${classification.product_type}".`;
    }

    confidence = Math.max(0, Math.min(confidence, 1.0));
    confidence = Math.round(confidence * 100) / 100;
    const confidenceLevel = confidence >= 0.85 ? "high" : confidence >= 0.65 ? "medium" : "low";

    const decisionReason = bestRule.decision_reason ||
      (best.productTypeMatch
        ? `Produto identificado como "${classification.product_type}" pela descrição normalizada, compatível com a regra.`
        : `Regra selecionada por aderência de palavras-chave e prioridade.`);

    let explanation = "";
    if (confidenceLevel === "high") explanation = `Classificação com alta confiança. ${decisionReason}`;
    else if (confidenceLevel === "medium") explanation = `Classificação com confiança média. ${decisionReason} Recomenda-se validação.`;
    else explanation = `Confiança insuficiente para classificação segura. ${decisionReason}`;

    // Rule version
    let ruleVersion = null;
    if (bestRule.rule_version_id) {
      const { data: rv } = await supabase.from("rule_versions")
        .select("version_label, version_code, published_at, created_at").eq("id", bestRule.rule_version_id).single();
      if (rv) ruleVersion = { version_label: rv.version_label, version_code: rv.version_code, published_at: rv.published_at || rv.created_at };
    }

    // Log
    await supabase.from("query_logs").insert({
      ean: body.ean || null, description: body.descricao || null, ncm, cst_icms: informedCst || finalCst,
      brand: body.marca || null, suggested_cbenef: confidenceLevel !== "low" ? bestRule.cbenef_code : null,
      confidence_score: confidence, rule_id: bestRule.id, matched_by: matchedBy,
    });

    const legalBasisUrl = bestRule.legal_basis_url || bestRule.legal_url || null;

    return new Response(JSON.stringify({
      cbenef_code: bestRule.cbenef_code,
      informed_cst_icms: informedCst || "",
      suggested_cst_icms: bestRule.suggested_cst_icms || bestRule.cst_icms || "",
      final_cst_icms: finalCst,
      cst_source: cstSource,
      cst_warning: cstWarning,
      confidence_score: confidence,
      confidence_level: confidenceLevel,
      matched_rule_id: bestRule.id,
      application_context: bestRule.application_context || "Operação interna — Estado de São Paulo",
      legal_basis_name: bestRule.legal_basis_name || bestRule.legal_basis || "",
      legal_basis_summary: bestRule.legal_basis_summary || "",
      legal_basis_url: legalBasisUrl,
      rule_version: ruleVersion,
      last_updated_at: bestRule.updated_at || bestRule.created_at,
      input_ncm: ncm,
      matched_ncm: bestRule.ncm,
      explanation,
      matched_by_ncm_exact: matchedByNcmExact,
      matched_by_ncm_prefix: matchedByNcmPrefix,
      keyword_match_count: best.includeHits.length,
      used_informed_cst: usedInformedCst,
      auto_suggested_cst: autoSuggestedCst,
      data_origin: bestRule.data_origin,
      normalized_description: norm.normalized_description,
      matched_keywords: best.includeHits,
      excluded_keywords_hit: excludedRules.map(e => (e.rule.keyword_exclude || []).filter(k =>
        norm.strong_tokens.includes(removeAccents(k.toLowerCase())) || norm.normalized_description.includes(removeAccents(k.toLowerCase()))
      )).flat(),
      inferred_macro_group: groupInference.inferred_macro_group,
      inferred_subgroup: groupInference.inferred_subgroup,
      informed_group: informedGroup || "",
      group_consistency_status: groupConsistency,
      product_family: bestRule.product_family || classification.product_family,
      product_type: bestRule.product_type || classification.product_type,
      presentation_type: bestRule.presentation_type || classification.presentation_type,
      output_st_applicable: bestRule.output_st_applicable ?? null,
      output_cfop: bestRule.output_cfop || "",
      decision_reason: decisionReason,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
