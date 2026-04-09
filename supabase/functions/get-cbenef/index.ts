import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  ean?: string;
  descricao?: string;
  ncm: string;
  cst_icms: string;
  marca?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();

    if (!body.ncm || !body.cst_icms) {
      return new Response(
        JSON.stringify({ error: "NCM e CST ICMS são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Normalize inputs
    const ncm = body.ncm.replace(/[^0-9]/g, "");
    const cstIcms = body.cst_icms.replace(/[^0-9]/g, "");
    const descricao = (body.descricao || "").toLowerCase().trim();
    const keywords = descricao.split(/\s+/).filter((w) => w.length > 2);

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
      const prefixes = [ncm.slice(0, 6), ncm.slice(0, 4)];
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

    // No rules found at all
    if (!rules || rules.length === 0) {
      // Log query
      await supabase.from("query_logs").insert({
        ean: body.ean || null,
        description: body.descricao || null,
        ncm: ncm,
        cst_icms: cstIcms,
        brand: body.marca || null,
        suggested_cbenef: null,
        confidence_score: 0,
        matched_by: "none",
      });

      return new Response(
        JSON.stringify({
          cbenef_code: "",
          confidence_score: 0,
          confidence_level: "none",
          rule_description: "Nenhuma regra encontrada para o NCM informado.",
          cst_considered: cstIcms,
          ncm_considered: ncm,
          legal_basis: "",
          legal_url: null,
          matched_by: "none",
          base_date: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Refine by CST ICMS
    const cstMatches = rules.filter((r) => r.cst_icms === cstIcms);
    if (cstMatches.length > 0) {
      rules = cstMatches;
      matchedBy += "+cst";
    }

    // 4. Refine by keywords
    if (keywords.length > 0 && rules.length > 1) {
      const scored = rules.map((r) => {
        const ruleKeywords = r.keywords || [];
        const ruleDesc = (r.description || "").toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (ruleKeywords.some((rk: string) => rk.toLowerCase().includes(kw))) score += 2;
          if (ruleDesc.includes(kw)) score += 1;
        }
        return { rule: r, keywordScore: score };
      });

      scored.sort((a, b) => b.keywordScore - a.keywordScore);
      if (scored[0].keywordScore > 0) {
        rules = [scored[0].rule];
        matchedBy += "+keywords";
      }
    }

    // Pick best rule
    const bestRule = rules[0];

    // Calculate confidence
    let confidence = 0;
    if (matchedBy.includes("ncm_exato")) confidence += 50;
    else confidence += 25;
    if (matchedBy.includes("cst")) confidence += 30;
    if (matchedBy.includes("keywords")) confidence += 20;

    confidence = Math.min(confidence, 100);

    const confidenceLevel = confidence >= 70 ? "high" : confidence >= 40 ? "medium" : "low";

    // Log query
    await supabase.from("query_logs").insert({
      ean: body.ean || null,
      description: body.descricao || null,
      ncm: ncm,
      cst_icms: cstIcms,
      brand: body.marca || null,
      suggested_cbenef: bestRule.cbenef_code,
      confidence_score: confidence,
      rule_id: bestRule.id,
      matched_by: matchedBy,
    });

    return new Response(
      JSON.stringify({
        cbenef_code: bestRule.cbenef_code,
        confidence_score: confidence,
        confidence_level: confidenceLevel,
        rule_description: bestRule.description || "Regra sem descrição detalhada.",
        cst_considered: cstIcms,
        ncm_considered: ncm,
        legal_basis: bestRule.legal_basis || "Fundamento não especificado na base.",
        legal_url: bestRule.legal_url || null,
        matched_by: matchedBy,
        base_date: bestRule.updated_at || bestRule.created_at,
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
