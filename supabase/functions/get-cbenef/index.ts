import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Commercial noise tokens (ignored for fiscal classification) ──
const NOISE_TOKENS = new Set([
  // brands
  "promissao","aurora","tirolez","frizzo","criolo","santo","antonio","parmalat",
  "nestle","danone","elegante","italac","piracanjuba","vigor","presidente",
  // packaging / units
  "pote","pct","pct.","pcts","un","und","unid","cx","cxa","caixa","kg","gr","g",
  "ml","lt","lts","litro","litros",
  // numbers
  "100","150","200","250","300","400","500","600","750","1000",
  // filler
  "de","do","da","com","sem","para","em","no","na","os","as","ao","pela","pelo",
]);

// ── Normalization ──
function removeAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeDescription(raw: string): {
  normalized_description: string;
  normalized_tokens: string[];
  strong_tokens: string[];
  commercial_noise_tokens: string[];
} {
  const lower = removeAccents(raw.toLowerCase().trim());
  // remove special chars except spaces
  const clean = lower.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const allTokens = clean.split(" ").filter(t => t.length > 0);

  const strong: string[] = [];
  const noise: string[] = [];

  for (const t of allTokens) {
    if (NOISE_TOKENS.has(t) || /^\d+$/.test(t)) {
      noise.push(t);
    } else {
      strong.push(t);
    }
  }

  return {
    normalized_description: clean,
    normalized_tokens: allTokens,
    strong_tokens: strong,
    commercial_noise_tokens: noise,
  };
}

// ── Infer product classification from strong tokens ──
function inferProductClassification(strongTokens: string[]): {
  product_family: string;
  product_type: string;
  presentation_type: string;
} {
  const joined = strongTokens.join(" ");

  // Families / types
  let family = "";
  let type = "";
  let presentation = "";

  // Dairy
  const dairyTypes: Record<string, string[]> = {
    manteiga: ["manteiga"],
    mussarela: ["mussarela", "mucarela", "muçarela", "mucarel", "mussarel"],
    requeijao: ["requeijao"],
    cream_cheese: ["cream cheese", "cream"],
    ricota: ["ricota"],
    parmesao: ["parmesao", "parmes"],
    provolone: ["provolone"],
    queijo: ["queijo"],
    iogurte: ["iogurte", "yogurte"],
    leite: ["leite"],
    creme_de_leite: ["creme leite"],
    nata: ["nata"],
  };

  for (const [dtype, kws] of Object.entries(dairyTypes)) {
    if (kws.some(k => joined.includes(k) || strongTokens.some(t => k.split(" ").every(kp => strongTokens.includes(kp))))) {
      family = "lacteos";
      type = dtype;
      break;
    }
  }

  // Presentation
  const presentations: Record<string, string[]> = {
    fatiada: ["fatiada", "fatiado", "fatia", "fatiados"],
    pedaco: ["pedaco", "peca", "inteiro", "inteira", "bloco"],
    pote: ["pote"],
    tablete: ["tablete", "tabletes", "barra"],
    ralado: ["ralado", "ralada"],
    banda: ["banda"],
  };
  for (const [ptype, kws] of Object.entries(presentations)) {
    if (kws.some(k => strongTokens.includes(k))) {
      presentation = ptype;
      break;
    }
  }

  // fallback: if no presentation but we identified type
  if (!presentation && type) presentation = "padrao";
  if (!family && !type) {
    family = "nao_identificado";
    type = "nao_identificado";
  }

  return { product_family: family, product_type: type, presentation_type: presentation };
}

// ── Rule scoring with semantic engine ──
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
  output_st_applicable: boolean | null;
  output_cst_icms: string | null;
  output_trib_code: string | null;
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
}

function scoreRule(
  rule: CbenefRule,
  strongTokens: string[],
  normalizedDesc: string,
  inferredType: string,
  inferredFamily: string
): ScoredRule {
  let score = 0;
  let excludeHit = false;
  const includeHits: string[] = [];

  // ── keyword_exclude: hard filter ──
  const kwExclude = (rule.keyword_exclude || []).map(k => removeAccents(k.toLowerCase()));
  for (const ex of kwExclude) {
    if (strongTokens.includes(ex) || normalizedDesc.includes(ex)) {
      excludeHit = true;
    }
  }

  // ── keyword_include: strong boost ──
  const kwInclude = (rule.keyword_include || []).map(k => removeAccents(k.toLowerCase()));
  for (const inc of kwInclude) {
    // multi-word keyword support
    const parts = inc.split(" ");
    if (parts.length > 1) {
      if (parts.every(p => strongTokens.includes(p) || normalizedDesc.includes(p))) {
        score += 10;
        includeHits.push(inc);
      }
    } else if (strongTokens.includes(inc) || normalizedDesc.includes(inc)) {
      score += 10;
      includeHits.push(inc);
    }
  }

  // ── Fallback: legacy keywords ──
  const legacyKw = (rule.keywords || []).map(k => removeAccents(k.toLowerCase()));
  for (const kw of legacyKw) {
    if (strongTokens.includes(kw) || normalizedDesc.includes(kw)) {
      score += 2;
    }
  }

  // ── description_patterns ──
  const patterns = (rule.description_patterns || []).map(p => removeAccents(p.toLowerCase()));
  for (const pat of patterns) {
    if (normalizedDesc.includes(pat)) {
      score += 8;
    }
  }

  // ── product_type coherence ──
  let productTypeMatch = false;
  if (rule.product_type && inferredType) {
    if (removeAccents(rule.product_type.toLowerCase()) === inferredType) {
      score += 15;
      productTypeMatch = true;
    }
  }

  // ── product_family coherence ──
  if (rule.product_family && inferredFamily) {
    if (removeAccents(rule.product_family.toLowerCase()) === inferredFamily) {
      score += 5;
    }
  }

  // ── data_origin bonus ──
  if (rule.data_origin === "imported") score += 3;

  // ── priority ──
  score += Math.min(rule.priority, 20);

  return { rule, score, excludeHit, includeHits, productTypeMatch };
}

// ── Description sufficiency check ──
function isDescriptionInsufficient(strongTokens: string[]): boolean {
  // Less than 2 strong tokens = too generic
  if (strongTokens.length < 2) return true;
  // Only generic terms
  const generic = new Set(["produto", "alimenticio", "alimento", "item", "mercadoria", "material", "laticinio", "laticinios"]);
  const nonGeneric = strongTokens.filter(t => !generic.has(t));
  return nonGeneric.length < 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (!body.ncm || !body.ncm.trim()) {
      return new Response(
        JSON.stringify({ error: "NCM é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!body.descricao || !body.descricao.trim()) {
      return new Response(
        JSON.stringify({ error: "Descrição do produto é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ncm = body.ncm.replace(/[^0-9]/g, "");
    const informedCst = body.cst_icms ? body.cst_icms.replace(/[^0-9]/g, "") : null;

    // ── B. Normalization ──
    const norm = normalizeDescription(body.descricao);
    const classification = inferProductClassification(norm.strong_tokens);

    // ── Description sufficiency ──
    const descInsufficient = isDescriptionInsufficient(norm.strong_tokens);

    // ── C. NCM pre-filter ──
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
      const prefixes = [ncm.slice(0, 6), ncm.slice(0, 4), ncm.slice(0, 2)];
      for (const prefix of prefixes) {
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

    // No rules at all
    if (!rules || rules.length === 0) {
      await supabase.from("query_logs").insert({
        ean: body.ean || null,
        description: body.descricao || null,
        ncm, cst_icms: informedCst || null,
        brand: body.marca || null,
        suggested_cbenef: null, confidence_score: 0, matched_by: "none",
      });
      return new Response(JSON.stringify({
        cbenef_code: "", informed_cst_icms: informedCst || "",
        suggested_cst_icms: "", final_cst_icms: "", cst_source: "none",
        confidence_score: 0, confidence_level: "low",
        matched_rule_id: null,
        application_context: "Operação interna — Estado de São Paulo",
        legal_basis_name: "", legal_basis_summary: "Nenhuma regra encontrada para o NCM informado.",
        legal_basis_url: null, rule_version: null,
        last_updated_at: new Date().toISOString(),
        input_ncm: ncm, matched_ncm: "",
        explanation: "Não foi possível encontrar uma regra correspondente para o NCM informado na base atual.",
        matched_by_ncm_exact: false, matched_by_ncm_prefix: false,
        keyword_match_count: 0, used_informed_cst: false, auto_suggested_cst: false,
        data_origin: "",
        normalized_description: norm.normalized_description,
        matched_keywords: [], excluded_keywords_hit: [],
        product_family: classification.product_family,
        product_type: classification.product_type,
        presentation_type: classification.presentation_type,
        output_st_applicable: null, output_trib_code: "", output_cfop: "",
        decision_reason: "Nenhuma regra encontrada.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── D+E. Score all rules with semantic engine ──
    const scored: ScoredRule[] = (rules as CbenefRule[]).map(r =>
      scoreRule(r, norm.strong_tokens, norm.normalized_description, classification.product_type, classification.product_family)
    );

    // Remove rules hit by keyword_exclude (hard filter)
    const eligible = scored.filter(s => !s.excludeHit);
    const excludedRules = scored.filter(s => s.excludeHit);

    // If all rules excluded, return low confidence
    if (eligible.length === 0) {
      const bestExcluded = scored[0];
      await supabase.from("query_logs").insert({
        ean: body.ean || null, description: body.descricao || null,
        ncm, cst_icms: informedCst || null, brand: body.marca || null,
        suggested_cbenef: null, confidence_score: 0.1, matched_by: "excluded_by_keywords",
      });
      return new Response(JSON.stringify({
        cbenef_code: "", informed_cst_icms: informedCst || "",
        suggested_cst_icms: "", final_cst_icms: "", cst_source: "none",
        confidence_score: 0.1, confidence_level: "low",
        matched_rule_id: null,
        application_context: "Operação interna — Estado de São Paulo",
        legal_basis_name: "", legal_basis_summary: "",
        legal_basis_url: null, rule_version: null,
        last_updated_at: new Date().toISOString(),
        input_ncm: ncm, matched_ncm: "",
        explanation: "As regras encontradas para este NCM foram eliminadas por conflito de palavras-chave com a descrição informada.",
        matched_by_ncm_exact: matchedByNcmExact, matched_by_ncm_prefix: matchedByNcmPrefix,
        keyword_match_count: 0, used_informed_cst: false, auto_suggested_cst: false,
        data_origin: "",
        normalized_description: norm.normalized_description,
        matched_keywords: [], excluded_keywords_hit: excludedRules.flatMap(e => (e.rule.keyword_exclude || [])),
        product_family: classification.product_family,
        product_type: classification.product_type,
        presentation_type: classification.presentation_type,
        output_st_applicable: null, output_trib_code: "", output_cfop: "",
        decision_reason: "Regras eliminadas por keyword_exclude.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Ranking: product_type match > include hits > score > priority ──
    eligible.sort((a, b) => {
      // 1. product_type coherence
      if (a.productTypeMatch !== b.productTypeMatch) return a.productTypeMatch ? -1 : 1;
      // 2. include hits count
      if (b.includeHits.length !== a.includeHits.length) return b.includeHits.length - a.includeHits.length;
      // 3. total score
      if (b.score !== a.score) return b.score - a.score;
      // 4. priority
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

    // Prefer output_cst_icms from semantic rule
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
        cstWarning = `O CST informado (${informedCst}) diverge do esperado (${ruleCst}) para este tipo de produto. O sistema utilizou o CST da regra identificada.`;
        matchedBy += "+cst_ajustado";
      }
    } else {
      finalCst = ruleCst;
      autoSuggestedCst = true;
      matchedBy += "+cst_sugerido";
    }

    // ── Confidence scoring ──
    let confidence = 0;

    // NCM (max 0.25)
    if (matchedByNcmExact) confidence += 0.25;
    else confidence += 0.10;

    // Product type match (max 0.25)
    if (best.productTypeMatch) confidence += 0.25;
    else if (best.includeHits.length > 0) confidence += 0.15;

    // keyword_include hits (max 0.20)
    if (best.includeHits.length >= 3) confidence += 0.20;
    else if (best.includeHits.length >= 2) confidence += 0.15;
    else if (best.includeHits.length >= 1) confidence += 0.10;

    // CST coherence (max 0.10)
    if (cstSource === "informado") confidence += 0.10;
    else if (cstSource === "sugerido" && ruleCst) confidence += 0.07;
    else if (cstSource === "ajustado") confidence += 0.03;

    // Legal basis (max 0.05)
    if (bestRule.legal_basis_name && bestRule.legal_basis_summary) confidence += 0.05;

    // Priority bonus (max 0.10)
    if (bestRule.priority >= 15) confidence += 0.10;
    else if (bestRule.priority >= 10) confidence += 0.07;
    else if (bestRule.priority >= 5) confidence += 0.04;

    // Data origin bonus (max 0.05)
    if (bestRule.data_origin === "imported") confidence += 0.05;

    // ── Penalty for insufficient description ──
    if (descInsufficient) {
      confidence = Math.min(confidence, 0.55);
      cstWarning = (cstWarning ? cstWarning + " " : "") +
        "A descrição informada é insuficiente para diferenciar corretamente o tipo fiscal do item. Informe uma descrição mais específica.";
    }

    // ── Penalty: NCM vs description conflict ──
    if (classification.product_type !== "nao_identificado" && bestRule.product_type &&
        removeAccents(bestRule.product_type.toLowerCase()) !== classification.product_type) {
      confidence -= 0.15;
      cstWarning = (cstWarning ? cstWarning + " " : "") +
        `Possível conflito: o NCM aponta para "${bestRule.product_type}" mas a descrição sugere "${classification.product_type}".`;
    }

    confidence = Math.max(0, Math.min(confidence, 1.0));
    confidence = Math.round(confidence * 100) / 100;

    const confidenceLevel = confidence >= 0.85 ? "high" : confidence >= 0.65 ? "medium" : "low";

    // ── Explanation ──
    const decisionReason = bestRule.decision_reason ||
      (best.productTypeMatch
        ? `Produto identificado como "${classification.product_type}" pela descrição normalizada, compatível com a regra.`
        : `Regra selecionada por aderência de palavras-chave e prioridade.`);

    let explanation = "";
    if (confidenceLevel === "high") {
      explanation = `Classificação com alta confiança. ${decisionReason}`;
    } else if (confidenceLevel === "medium") {
      explanation = `Classificação com confiança média. ${decisionReason} Recomenda-se validação.`;
    } else {
      explanation = `Confiança insuficiente para classificação segura. ${decisionReason}`;
    }

    // ── Rule version ──
    let ruleVersion = null;
    if (bestRule.rule_version_id) {
      const { data: rv } = await supabase
        .from("rule_versions")
        .select("version_label, version_code, published_at, created_at")
        .eq("id", bestRule.rule_version_id)
        .single();
      if (rv) {
        ruleVersion = {
          version_label: rv.version_label,
          version_code: rv.version_code,
          published_at: rv.published_at || rv.created_at,
        };
      }
    }

    // ── Log ──
    await supabase.from("query_logs").insert({
      ean: body.ean || null, description: body.descricao || null,
      ncm, cst_icms: informedCst || finalCst,
      brand: body.marca || null,
      suggested_cbenef: confidenceLevel !== "low" ? bestRule.cbenef_code : null,
      confidence_score: confidence, rule_id: bestRule.id,
      matched_by: matchedBy,
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
      // Audit
      matched_by_ncm_exact: matchedByNcmExact,
      matched_by_ncm_prefix: matchedByNcmPrefix,
      keyword_match_count: best.includeHits.length,
      used_informed_cst: usedInformedCst,
      auto_suggested_cst: autoSuggestedCst,
      data_origin: bestRule.data_origin,
      // Semantic fields
      normalized_description: norm.normalized_description,
      matched_keywords: best.includeHits,
      excluded_keywords_hit: excludedRules.map(e => (e.rule.keyword_exclude || []).filter(k =>
        norm.strong_tokens.includes(removeAccents(k.toLowerCase())) || norm.normalized_description.includes(removeAccents(k.toLowerCase()))
      )).flat(),
      product_family: bestRule.product_family || classification.product_family,
      product_type: bestRule.product_type || classification.product_type,
      presentation_type: bestRule.presentation_type || classification.presentation_type,
      output_st_applicable: bestRule.output_st_applicable ?? null,
      output_trib_code: bestRule.output_trib_code || "",
      output_cfop: bestRule.output_cfop || "",
      decision_reason: decisionReason,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
