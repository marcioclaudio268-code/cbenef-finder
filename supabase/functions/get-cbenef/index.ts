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

// ══════════════════════════════════════════════════════
// GROUP INFERENCE KEYWORDS — site taxonomy
// ══════════════════════════════════════════════════════
const GROUP_KEYWORDS: Record<string, { macro: string; sub?: string; keywords: string[] }[]> = {
  carnes_bovinas: [
    { macro: "carnes_bovinas", sub: "bovino_in_natura", keywords: ["alcatra","picanha","patinho","file mignon","acem","coxao mole","coxao duro","contra file","maminha","fraldinha","lagarto","musculo"] },
    { macro: "carnes_bovinas", sub: "bovino_com_osso", keywords: ["costela bovina","t-bone","ossobuco"] },
    { macro: "carnes_bovinas", sub: "miudos_bovinos", keywords: ["figado bovino","lingua bovina","rabo","bucho","dobradinha","mondongo"] },
    { macro: "carnes_bovinas", sub: "bovino_salgado", keywords: ["charque","carne seca","carne sol","jabá"] },
  ],
  carnes_suinas: [
    { macro: "carnes_suinas", sub: "suino_in_natura", keywords: ["pernil","lombo suino","bisteca suina","costela suina"] },
    { macro: "carnes_suinas", sub: "bacon_toucinho", keywords: ["bacon","toucinho","panceta"] },
    { macro: "carnes_suinas", sub: "miudos_suinos", keywords: ["pe suino","orelha suina","rabo suino"] },
  ],
  aves: [
    { macro: "aves", sub: "frango_inteiro", keywords: ["frango inteiro","galinha inteira"] },
    { macro: "aves", sub: "cortes_frango", keywords: ["coxa","sobrecoxa","asa","peito frango","peito de frango","file peito","coxinha asa","tulipa","meio asa","sassami"] },
    { macro: "aves", sub: "miudos_frango", keywords: ["moela","coracao frango","figado frango","pe frango"] },
    { macro: "aves", sub: "frango_temperado", keywords: ["frango temperado","ave temperada"] },
  ],
  pescados: [
    { macro: "pescados", sub: "peixe_inteiro", keywords: ["tilapia inteira","sardinha inteira","peixe inteiro"] },
    { macro: "pescados", sub: "file_peixe", keywords: ["file tilapia","file merluza","file peixe","file pescada","file salmao"] },
    { macro: "pescados", sub: "peixe_posta", keywords: ["posta","posta cacao","posta peixe"] },
    { macro: "pescados", sub: "pescado_salgado", keywords: ["bacalhau","bacalhau salgado","charque peixe"] },
  ],
  frios_embutidos: [
    { macro: "frios_embutidos", keywords: ["presunto","mortadela","salame","linguica","salsicha","apresuntado","copa","peito peru","blanquet","calabresa","paio"] },
  ],
  queijos: [
    { macro: "queijos", sub: "mussarela_peca", keywords: ["mussarela","mucarela","muçarela"] },
    { macro: "queijos", sub: "prato", keywords: ["queijo prato","prato"] },
    { macro: "queijos", sub: "provolone", keywords: ["provolone"] },
    { macro: "queijos", sub: "coalho", keywords: ["coalho","queijo coalho"] },
    { macro: "queijos", sub: "minas_frescal", keywords: ["minas frescal","minas","frescal"] },
    { macro: "queijos", sub: "queijo_ralado", keywords: ["queijo ralado","ralado"] },
    { macro: "queijos", sub: "queijos_especiais", keywords: ["brie","camembert","gorgonzola","gruyere","emmental","gouda","cheddar"] },
  ],
  laticinios: [
    { macro: "laticinios", sub: "manteiga", keywords: ["manteiga"] },
    { macro: "laticinios", sub: "leite_uht", keywords: ["leite","leite uht","leite integral","leite desnatado","leite semi"] },
    { macro: "laticinios", sub: "leite_po", keywords: ["leite po","leite em po"] },
    { macro: "laticinios", sub: "creme_leite", keywords: ["creme de leite","creme leite"] },
    { macro: "laticinios", sub: "requeijao", keywords: ["requeijao"] },
    { macro: "laticinios", sub: "ricota", keywords: ["ricota"] },
    { macro: "laticinios", sub: "nata", keywords: ["nata"] },
    { macro: "laticinios", sub: "leite_condensado", keywords: ["leite condensado"] },
    { macro: "laticinios", sub: "iogurte", keywords: ["iogurte","yogurte"] },
  ],
  hortifruti: [
    { macro: "hortifruti", keywords: ["alface","tomate","cebola","batata","uva","banana","mamao","mandioca","laranja","limao","abobora","cenoura","beterraba","pepino","pimentao","alho","manga","melao","melancia","morango","abacaxi","kiwi","pera","maca","ameixa"] },
  ],
  ovos_mel: [
    { macro: "ovos_mel", keywords: ["ovo","ovos","mel"] },
  ],
  basicos_graos: [
    { macro: "basicos_graos", keywords: ["arroz","feijao","cafe","oleo","lentilha","grao de bico","ervilha","soja","milho","fuba","aveia","quinoa","chia","linhaça"] },
  ],
  farinhas_derivados: [
    { macro: "farinhas_derivados", keywords: ["farinha","farinha trigo","farinha mandioca","amido","polvilho","farinha rosca","maisena","farinha milho"] },
  ],
  temperos_especiarias: [
    { macro: "temperos_especiarias", keywords: ["oregano","paprica","colorifico","canela","cravo","noz moscada","louro","cominho","curcuma","gengibre","pimenta","alecrim","manjericao","salsa","cebolinha","coentro","mostarda"] },
  ],
  mercearia_doce: [
    { macro: "mercearia_doce", keywords: ["acucar","chocolate","biscoito","bolacha","geleia","doce","brigadeiro","panetone","wafer","bombom"] },
  ],
  mercearia_salgada: [
    { macro: "mercearia_salgada", keywords: ["macarrao","massa","molho tomate","extrato tomate","azeitona","palmito","milho verde","ervilha lata","atum","sardinha lata","catchup","ketchup","maionese","vinagre","azeite"] },
  ],
  congelados_prontos: [
    { macro: "congelados_prontos", keywords: ["pizza congelada","lasanha congelada","hamburguer congelado","nuggets","empanado","batata frita congelada","sorvete","picole","acai"] },
  ],
  bebidas: [
    { macro: "bebidas", keywords: ["agua mineral","refrigerante","suco","cerveja","vinho","vodka","whisky","cachaca","energetico","cha","agua coco"] },
  ],
  bazar_utilidades: [
    { macro: "bazar_utilidades", keywords: ["copo","prato descartavel","guardanapo","papel aluminio","filme pvc","sacola","pilha","lampada","vela"] },
  ],
  higiene_perfumaria: [
    { macro: "higiene_perfumaria", keywords: ["shampoo","condicionador","sabonete","pasta dental","escova dental","desodorante","papel higienico","absorvente","fralda","creme dental"] },
  ],
  limpeza: [
    { macro: "limpeza", keywords: ["detergente","desinfetante","agua sanitaria","alvejante","amaciante","sabao po","sabao liquido","esponja","pano chao","vassoura","rodo"] },
  ],
};

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

// ── Infer macro_group + subgroup from description ──
function inferGroup(strongTokens: string[], normalizedDesc: string): {
  inferred_macro_group: string;
  inferred_subgroup: string;
  best_score: number;
} {
  let bestMacro = "";
  let bestSub = "";
  let bestScore = 0;

  for (const [_key, entries] of Object.entries(GROUP_KEYWORDS)) {
    for (const entry of entries) {
      let score = 0;
      for (const kw of entry.keywords) {
        const normKw = removeAccents(kw.toLowerCase());
        const parts = normKw.split(" ");
        if (parts.length > 1) {
          if (parts.every(p => strongTokens.includes(p) || normalizedDesc.includes(normKw))) score += 10;
        } else if (strongTokens.includes(normKw)) {
          score += 10;
        } else if (normalizedDesc.includes(normKw)) {
          score += 5;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMacro = entry.macro;
        bestSub = entry.sub || "";
      }
    }
  }
  return { inferred_macro_group: bestMacro, inferred_subgroup: bestSub, best_score: bestScore };
}

// ── Infer product classification from strong tokens ──
function inferProductClassification(strongTokens: string[]) {
  const joined = strongTokens.join(" ");
  let family = "", type = "", presentation = "";

  const dairyTypes: Record<string, string[]> = {
    manteiga: ["manteiga"],
    mussarela: ["mussarela","mucarela","mucarel","mussarel"],
    requeijao: ["requeijao"],
    cream_cheese: ["cream cheese","cream"],
    ricota: ["ricota"],
    parmesao: ["parmesao","parmes"],
    provolone: ["provolone"],
    queijo: ["queijo"],
    iogurte: ["iogurte","yogurte"],
    leite: ["leite"],
    creme_de_leite: ["creme leite"],
    nata: ["nata"],
  };

  for (const [dtype, kws] of Object.entries(dairyTypes)) {
    if (kws.some(k => joined.includes(k) || strongTokens.some(t => k.split(" ").every(kp => strongTokens.includes(kp))))) {
      family = "lacteos"; type = dtype; break;
    }
  }

  // Meat types
  if (!family) {
    const meatKw: Record<string, string[]> = {
      bovino: ["alcatra","picanha","patinho","file mignon","acem","coxao","maminha","fraldinha","lagarto","musculo","costela bovina","charque","carne seca","carne sol"],
      suino: ["pernil","lombo suino","bisteca suina","costela suina","bacon","toucinho","panceta"],
      frango: ["frango","coxa","sobrecoxa","asa","peito frango","sassami","moela","coracao frango"],
      peixe: ["tilapia","merluza","sardinha","salmao","bacalhau","corvina","peixe","file peixe"],
    };
    for (const [mtype, kws] of Object.entries(meatKw)) {
      if (kws.some(k => joined.includes(k))) { family = "carnes"; type = mtype; break; }
    }
  }

  const presentations: Record<string, string[]> = {
    fatiada: ["fatiada","fatiado","fatia","fatiados"],
    pedaco: ["pedaco","peca","inteiro","inteira","bloco"],
    pote: ["pote"],
    tablete: ["tablete","tabletes","barra"],
    ralado: ["ralado","ralada"],
    banda: ["banda"],
    sal: [],
  };
  // Detect "com sal" / "sem sal" as extra qualifier, not presentation
  if (strongTokens.includes("sal")) {
    // no-op, sal is a qualifier
  }
  for (const [ptype, kws] of Object.entries(presentations)) {
    if (kws.length > 0 && kws.some(k => strongTokens.includes(k))) { presentation = ptype; break; }
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
}

function scoreRule(
  rule: CbenefRule,
  strongTokens: string[],
  normalizedDesc: string,
  inferredType: string,
  inferredFamily: string,
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

  return { rule, score, excludeHit, includeHits, productTypeMatch, groupMatch };
}

function isDescriptionInsufficient(strongTokens: string[]): boolean {
  if (strongTokens.length < 2) return true;
  const generic = new Set(["produto","alimenticio","alimento","item","mercadoria","material","laticinio","laticinios","carne","peixe","queijo","mercearia"]);
  const nonGeneric = strongTokens.filter(t => !generic.has(t));
  return nonGeneric.length < 1;
}

// ══════════════════════════════════════════════════════
// MACROGROUP LIST for validation
// ══════════════════════════════════════════════════════
const VALID_MACROGROUPS = new Set(Object.keys(GROUP_KEYWORDS));

function buildLowConfidenceResponse(
  ncm: string, informedCst: string | null, norm: ReturnType<typeof normalizeDescription>,
  classification: ReturnType<typeof inferProductClassification>,
  groupInference: ReturnType<typeof inferGroup>,
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
    const groupInference = inferGroup(norm.strong_tokens, norm.normalized_description);
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
        groupInference.inferred_macro_group, groupInference.inferred_subgroup, informedGroup)
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

    // ── Ranking: productTypeMatch > groupMatch > includeHits > score > priority ──
    eligible.sort((a, b) => {
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
    // Group bonus
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
      // Semantic
      normalized_description: norm.normalized_description,
      matched_keywords: best.includeHits,
      excluded_keywords_hit: excludedRules.map(e => (e.rule.keyword_exclude || []).filter(k =>
        norm.strong_tokens.includes(removeAccents(k.toLowerCase())) || norm.normalized_description.includes(removeAccents(k.toLowerCase()))
      )).flat(),
      // Group
      inferred_macro_group: groupInference.inferred_macro_group,
      inferred_subgroup: groupInference.inferred_subgroup,
      informed_group: informedGroup || "",
      group_consistency_status: groupConsistency,
      // Classification
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
