import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SourceRule {
  cbenef_code: string;
  ncm: string;
  cst_icms?: string;
  suggested_cst_icms?: string;
  description?: string;
  keywords?: string[];
  legal_basis?: string;
  legal_basis_name?: string;
  legal_basis_summary?: string;
  legal_basis_url?: string;
  legal_url?: string;
  application_context?: string;
  priority?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Get active source feeds for SP
    const { data: feeds, error: feedError } = await supabase
      .from("source_feeds")
      .select("*")
      .eq("is_active", true)
      .eq("state", "SP");

    if (feedError) throw feedError;

    if (!feeds || feeds.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma fonte ativa encontrada. Configure source_feeds." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const feed of feeds) {
      // 2. Create update run
      const { data: run, error: runError } = await supabase
        .from("source_update_runs")
        .insert({
          source_feed_id: feed.id,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (runError) throw runError;

      try {
        // 3. Fetch data from source
        let sourceRules: SourceRule[] = [];

        if (feed.url) {
          const response = await fetch(feed.url, {
            headers: { "Accept": "application/json" },
          });

          if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status} ${response.statusText} from ${feed.url}`);
          }

          const rawData = await response.json();

          // Normalize: accept array directly or { rules: [...] } or { data: [...] }
          if (Array.isArray(rawData)) {
            sourceRules = rawData;
          } else if (Array.isArray(rawData.rules)) {
            sourceRules = rawData.rules;
          } else if (Array.isArray(rawData.data)) {
            sourceRules = rawData.data;
          } else {
            throw new Error("Formato de resposta não reconhecido. Esperado array ou { rules: [] } ou { data: [] }.");
          }
        } else {
          throw new Error(`Feed "${feed.name}" não possui URL configurada.`);
        }

        if (sourceRules.length === 0) {
          throw new Error("Fonte retornou 0 regras. Abortando para segurança dos dados.");
        }

        // 4. Create rule version
        const versionLabel = `v${new Date().toISOString().slice(0, 10)}`;
        const { data: version, error: versionError } = await supabase
          .from("rule_versions")
          .insert({
            source_feed_id: feed.id,
            version_label: versionLabel,
            version_code: `${feed.name}-${versionLabel}`,
            published_at: new Date().toISOString(),
            is_current: true,
          })
          .select()
          .single();

        if (versionError) throw versionError;

        // Mark previous versions as not current
        await supabase
          .from("rule_versions")
          .update({ is_current: false })
          .eq("source_feed_id", feed.id)
          .neq("id", version.id);

        // 5. Deactivate old rules for this feed's versions
        const { data: oldVersions } = await supabase
          .from("rule_versions")
          .select("id")
          .eq("source_feed_id", feed.id)
          .neq("id", version.id);

        if (oldVersions && oldVersions.length > 0) {
          const oldIds = oldVersions.map((v: { id: string }) => v.id);
          await supabase
            .from("cbenef_rules")
            .update({ is_active: false })
            .in("rule_version_id", oldIds);
        }

        // 6. Insert new rules
        let inserted = 0;
        let errors = 0;

        // Process in batches of 50
        const batchSize = 50;
        for (let i = 0; i < sourceRules.length; i += batchSize) {
          const batch = sourceRules.slice(i, i + batchSize);
          const rows = batch.map((r) => ({
            cbenef_code: r.cbenef_code,
            ncm: (r.ncm || "").replace(/[^0-9]/g, ""),
            cst_icms: r.cst_icms || null,
            suggested_cst_icms: r.suggested_cst_icms || null,
            description: r.description || null,
            keywords: r.keywords || null,
            legal_basis: r.legal_basis || null,
            legal_basis_name: r.legal_basis_name || null,
            legal_basis_summary: r.legal_basis_summary || null,
            legal_basis_url: r.legal_basis_url || r.legal_url || null,
            legal_url: r.legal_url || null,
            application_context: r.application_context || "Operação interna — Estado de São Paulo",
            priority: r.priority ?? 10,
            rule_version_id: version.id,
            is_active: true,
            state: "SP",
          }));

          const { error: insertError, data: insertedData } = await supabase
            .from("cbenef_rules")
            .insert(rows)
            .select("id");

          if (insertError) {
            console.error(`Batch insert error at offset ${i}:`, insertError.message);
            errors += batch.length;
          } else {
            inserted += (insertedData?.length || 0);
          }
        }

        // 7. Update run as completed
        await supabase
          .from("source_update_runs")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
            records_processed: inserted,
            error_message: errors > 0 ? `${errors} registros falharam na inserção` : null,
          })
          .eq("id", run.id);

        results.push({
          feed: feed.name,
          status: "completed",
          records_processed: inserted,
          errors: errors,
          version: versionLabel,
        });
      } catch (innerErr) {
        await supabase
          .from("source_update_runs")
          .update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: innerErr.message,
          })
          .eq("id", run.id);

        results.push({ feed: feed.name, status: "error", error: innerErr.message });
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
