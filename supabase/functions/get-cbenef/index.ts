import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  ean?: string;
  descricao?: string;
  ncm: string;
  cst_icms?: string;
  marca?: string;
}

interface CbenefRule {
  id: string;
  cbenef_code: string;
  ncm: string;
  cst_icms: string | null;
  suggested_cst_icms: string | null;
  description: string | null;
  keywords: string[] | null;
  legal_basis: string | null;
  legal_url: string | null;
  legal_basis_name: string | null;
  legal_basis_summary: string | null;
  application_context: string | null;
  priority: number;
  rule_version_id: string | null;
  is_active: boolean;
  updated_at: string;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();

    if (!body.ncm) {
      return new Response(
        JSON.stringify({ error: "NCM é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Normalize inputs
    const ncm = body.ncm.replace(/[^0-9]/g, "");
    const informedCst = body.cst_icms ? body.cst_icms.replace(/[^0-9]/g, "") : null;
    const descricao = (body.descricao || "").toLowerCase().trim();
    const marca = (body.marca || "").toLowerCase().trim();
    const keywords = descricao.split(/\s+/).filter((w) => w.length > 2);
    if (marca.length > 2) keywords.push(marca);

    // 1. Exact NCM match
    let { data: rules } = await supabase
      .from("cbenef_rules")
      .select("*")
      .eq("ncm", ncm)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    let matchedBy = "ncm_exato";

    // 2. Prefix match if no exact
    if (!rules || rules.length === 0) {
      const prefixes = [ncm.slice(0, 6), ncm.slice(0, 4), ncm.slice(0, 2)];
      for (const prefix of prefixes) {
        const { data } = await supabase
          .from("cbenef_rules")
          .select("*")
          .like("ncm", `${prefix}%`)
          .eq("is_active", true)
          .order("priority", { ascending: false });
        if (data && data.length > 0) {
          rules = data;
          matchedBy = "ncm_prefixo";
          break;
        }
      }
    }

    // No rules found
    if (!rules || rules.length === 0) {
      await supabase.from("query_logs").insert({
        ean: body.ean || null,
        description: body.descricao || null,
        ncm: ncm,
        cst_icms: informedCst || null,
        brand: body.marca || null,
        suggested_cbenef: null,
        confidence_score: 0,
        matched_by: "none",
      });

      return new Response(
        JSON.stringify({
          cbenef_code: "",
          informed_cst_icms: informedCst || "",
          suggested_cst_icms: "",
          final_cst_icms: "",
          cst_source: "none",
          confidence_score: 0,
          confidence_level: "low",
          matched_rule_id: null,
          application_context: "Operação interna — Estado de São Paulo",
          legal_basis_name: "",
          legal_basis_summary: "Nenhuma regra encontrada para o NCM informado.",
          legal_basis_url: null,
          rule_version: null,
          last_updated_at: new Date().toISOString(),
          input_ncm: ncm,
          matched_ncm: "",
          explanation: "Não foi possível encontrar uma regra correspondente para o NCM informado na base atual.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Keyword scoring
    const scored = (rules as CbenefRule[]).map((r) => {
      const ruleKeywords = r.keywords || [];
      const ruleDesc = (r.description || "").toLowerCase();
      let kwScore = 0;
      for (const kw of keywords) {
        if (ruleKeywords.some((rk: string) => rk.toLowerCase().includes(kw))) kwScore += 2;
        if (ruleDesc.includes(kw)) kwScore += 1;
      }
      return { rule: r, kwScore };
    });

    // 4. CST matching
    let cstSource: "informado" | "sugerido" | "ajustado" = "sugerido";
    let finalCst = "";
    let cstWarning = "";

    if (informedCst) {
      // Filter rules that match informed CST
      const cstMatches = scored.filter((s) => s.rule.cst_icms === informedCst);
      if (cstMatches.length > 0) {
        // CST informed and coherent
        cstSource = "informado";
        finalCst = informedCst;
        // Boost scores for CST matches
        cstMatches.forEach((s) => s.kwScore += 5);
        matchedBy += "+cst_informado";
      } else {
        // CST informed but divergent
        cstSource = "ajustado";
        cstWarning = "O CST informado não parece compatível com a regra encontrada. A resposta usa o enquadramento mais provável identificado pelo sistema.";
        matchedBy += "+cst_ajustado";
      }
    } else {
      matchedBy += "+cst_sugerido";
    }

    // Sort by keyword score then priority
    scored.sort((a, b) => {
      if (b.kwScore !== a.kwScore) return b.kwScore - a.kwScore;
      return b.rule.priority - a.rule.priority;
    });

    const bestRule = scored[0].rule;
    const bestKwScore = scored[0].kwScore;

    // Determine final CST
    if (cstSource === "informado") {
      finalCst = informedCst!;
    } else {
      finalCst = bestRule.suggested_cst_icms || bestRule.cst_icms || "";
    }

    // Calculate confidence score (0-1 scale)
    let confidence = 0;

    // NCM match quality
    if (matchedBy.includes("ncm_exato")) {
      confidence += 0.40;
    } else {
      confidence += 0.15;
    }

    // Keyword relevance
    if (bestKwScore >= 4) confidence += 0.25;
    else if (bestKwScore >= 2) confidence += 0.15;
    else if (bestKwScore >= 1) confidence += 0.08;

    // CST coherence
    if (cstSource === "informado") confidence += 0.25;
    else if (cstSource === "sugerido" && bestRule.cst_icms) confidence += 0.15;
    else if (cstSource === "ajustado") confidence += 0.05;

    // Priority bonus
    if (bestRule.priority >= 15) confidence += 0.10;
    else if (bestRule.priority >= 10) confidence += 0.05;

    confidence = Math.min(confidence, 1.0);
    confidence = Math.round(confidence * 100) / 100;

    const confidenceLevel = confidence >= 0.90 ? "high" : confidence >= 0.75 ? "medium" : "low";

    // Build explanation
    let explanation = "";
    if (confidenceLevel === "high") {
      explanation = `Regra encontrada com alta confiança para NCM ${ncm}. ${bestRule.description || ""}`;
    } else if (confidenceLevel === "medium") {
      explanation = `Sugestão com confiança média para NCM ${ncm}. Recomenda-se validação antes do uso em documento fiscal.`;
    } else {
      explanation = `Não foi possível sugerir um cBenef com segurança com base nos dados informados.`;
    }

    // Get rule version info
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

    // Log query
    await supabase.from("query_logs").insert({
      ean: body.ean || null,
      description: body.descricao || null,
      ncm: ncm,
      cst_icms: informedCst || finalCst,
      brand: body.marca || null,
      suggested_cbenef: confidenceLevel !== "low" ? bestRule.cbenef_code : null,
      confidence_score: confidence,
      rule_id: bestRule.id,
      matched_by: matchedBy,
    });

    return new Response(
      JSON.stringify({
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
        legal_basis_url: bestRule.legal_url || null,
        rule_version: ruleVersion,
        last_updated_at: bestRule.updated_at || bestRule.created_at,
        input_ncm: ncm,
        matched_ncm: bestRule.ncm,
        explanation: explanation,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
