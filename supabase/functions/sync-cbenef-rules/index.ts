import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * =============================================================
 * FORMATO-PADRÃO DE IMPORTAÇÃO (manual_json / remote_json)
 * =============================================================
 * Cada regra deve conter os seguintes campos:
 *
 * {
 *   "ncm_code":            string  (obrigatório — apenas dígitos, ex: "21069010"),
 *   "cbenef_code":         string  (obrigatório — ex: "SP000262"),
 *   "cst_icms":            string  (opcional — CST esperado, ex: "020"),
 *   "suggested_cst_icms":  string  (opcional — CST sugerido pela regra),
 *   "description":         string  (opcional — descrição da regra),
 *   "application_context": string  (opcional — padrão: "Operação interna — Estado de São Paulo"),
 *   "legal_basis_name":    string  (opcional — nome do dispositivo legal),
 *   "legal_basis_summary": string  (opcional — resumo do benefício),
 *   "legal_basis_url":     string  (opcional — link do texto legal),
 *   "priority":            number  (opcional — padrão: 10),
 *   "keywords":            string[] (opcional — palavras-chave de match),
 *   "is_active":           boolean (opcional — padrão: true)
 * }
 *
 * =============================================================
 * MODOS DE OPERAÇÃO (source_type)
 * =============================================================
 *
 * 1. remote_json — busca regras de URL configurada em source_feeds
 *    POST sem body, ou body vazio. Processa todos os feeds ativos.
 *
 * 2. manual_json — recebe regras diretamente no body da requisição
 *    POST { source_type: "manual_json", source_name: "...", rules: [...] }
 *
 * 3. manual_csv — recebe CSV no body da requisição
 *    POST { source_type: "manual_csv", source_name: "...", csv: "..." }
 *    Colunas CSV: ncm_code,cbenef_code,cst_icms,suggested_cst_icms,
 *                 description,application_context,legal_basis_name,
 *                 legal_basis_summary,legal_basis_url,priority,keywords,is_active
 * =============================================================
 */

interface ImportRule {
  ncm_code?: string;
  ncm?: string;
  cbenef_code: string;
  cst_icms?: string;
  suggested_cst_icms?: string;
  description?: string;
  application_context?: string;
  legal_basis_name?: string;
  legal_basis_summary?: string;
  legal_basis_url?: string;
  legal_url?: string;
  legal_basis?: string;
  priority?: number;
  keywords?: string[];
  keyword_include?: string[];
  keyword_exclude?: string[];
  is_active?: boolean;
}

interface ImportCounters {
  processed: number;
  inserted: number;
  failed: number;
}

// ── CSV parser (simple, handles quoted fields) ──
function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    if (values.length !== headers.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = values[idx]));
    rows.push(row);
  }
  return rows;
}

// ── Normalize rule from any source to DB row ──
function normalizeRule(
  r: ImportRule,
  versionId: string,
  dataOrigin: "seed" | "imported"
): Record<string, unknown> {
  const ncm = ((r.ncm_code || r.ncm || "").toString()).replace(/[^0-9]/g, "");
  const keywords = r.keywords || r.keyword_include || null;

  return {
    cbenef_code: r.cbenef_code,
    ncm,
    cst_icms: r.cst_icms || null,
    suggested_cst_icms: r.suggested_cst_icms || null,
    description: r.description || null,
    keywords,
    legal_basis: r.legal_basis || r.legal_basis_name || null,
    legal_basis_name: r.legal_basis_name || null,
    legal_basis_summary: r.legal_basis_summary || null,
    legal_basis_url: r.legal_basis_url || r.legal_url || null,
    legal_url: r.legal_url || r.legal_basis_url || null,
    application_context: r.application_context || "Operação interna — Estado de São Paulo",
    priority: r.priority ?? 10,
    rule_version_id: versionId,
    is_active: r.is_active !== false,
    state: "SP",
    data_origin: dataOrigin,
  };
}

// ── Convert CSV rows to ImportRule[] ──
function csvRowsToRules(rows: Record<string, string>[]): ImportRule[] {
  return rows.map((row) => ({
    ncm_code: row.ncm_code || row.ncm || "",
    cbenef_code: row.cbenef_code || "",
    cst_icms: row.cst_icms || undefined,
    suggested_cst_icms: row.suggested_cst_icms || undefined,
    description: row.description || undefined,
    application_context: row.application_context || undefined,
    legal_basis_name: row.legal_basis_name || undefined,
    legal_basis_summary: row.legal_basis_summary || undefined,
    legal_basis_url: row.legal_basis_url || undefined,
    priority: row.priority ? parseInt(row.priority, 10) : undefined,
    keywords: row.keywords ? row.keywords.split(";").map((k) => k.trim()) : undefined,
    is_active: row.is_active ? row.is_active !== "false" : undefined,
  }));
}

// ── Batch insert rules ──
async function insertRulesBatch(
  supabase: ReturnType<typeof createClient>,
  rules: ImportRule[],
  versionId: string,
  dataOrigin: "seed" | "imported"
): Promise<ImportCounters> {
  const counters: ImportCounters = { processed: rules.length, inserted: 0, failed: 0 };
  const batchSize = 50;

  for (let i = 0; i < rules.length; i += batchSize) {
    const batch = rules.slice(i, i + batchSize);
    const rows = batch.map((r) => normalizeRule(r, versionId, dataOrigin));

    const { error, data } = await supabase
      .from("cbenef_rules")
      .insert(rows)
      .select("id");

    if (error) {
      console.error(`Batch insert error at offset ${i}:`, error.message);
      counters.failed += batch.length;
    } else {
      counters.inserted += data?.length || 0;
    }
  }

  return counters;
}

// ── Create version + deactivate old rules ──
async function createVersionAndDeactivateOld(
  supabase: ReturnType<typeof createClient>,
  feedId: string,
  feedName: string
) {
  const versionLabel = `v${new Date().toISOString().slice(0, 10)}`;
  const { data: version, error } = await supabase
    .from("rule_versions")
    .insert({
      source_feed_id: feedId,
      version_label: versionLabel,
      version_code: `${feedName}-${versionLabel}`,
      published_at: new Date().toISOString(),
      is_current: true,
    })
    .select()
    .single();

  if (error) throw error;

  // Mark previous versions as not current
  await supabase
    .from("rule_versions")
    .update({ is_current: false })
    .eq("source_feed_id", feedId)
    .neq("id", version.id);

  // Deactivate old rules
  const { data: oldVersions } = await supabase
    .from("rule_versions")
    .select("id")
    .eq("source_feed_id", feedId)
    .neq("id", version.id);

  if (oldVersions && oldVersions.length > 0) {
    const oldIds = oldVersions.map((v: { id: string }) => v.id);
    await supabase
      .from("cbenef_rules")
      .update({ is_active: false })
      .in("rule_version_id", oldIds);
  }

  return { version, versionLabel };
}

// ── Normalize JSON source data ──
function extractRulesFromJson(rawData: unknown): ImportRule[] {
  if (Array.isArray(rawData)) return rawData;
  if (rawData && typeof rawData === "object") {
    const obj = rawData as Record<string, unknown>;
    if (Array.isArray(obj.rules)) return obj.rules;
    if (Array.isArray(obj.data)) return obj.data;
  }
  throw new Error("Formato JSON não reconhecido. Esperado: array, { rules: [] } ou { data: [] }.");
}

// ══════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // Parse body (may be empty for remote_json feed sync)
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body — defaults to remote_json feed processing
    }

    const sourceType = (body.source_type as string) || "remote_json";

    // ─── MANUAL_JSON import ───
    if (sourceType === "manual_json") {
      const sourceName = (body.source_name as string) || "importação-manual";
      const rules = body.rules as ImportRule[];

      if (!rules || !Array.isArray(rules) || rules.length === 0) {
        return jsonResponse({ error: "Campo 'rules' obrigatório e deve ser array não vazio." }, 400);
      }

      // Ensure/get feed
      const feed = await getOrCreateFeed(supabase, sourceName, "manual_json");

      // Create run
      const run = await createRun(supabase, feed.id);

      try {
        const { version, versionLabel } = await createVersionAndDeactivateOld(supabase, feed.id, feed.name);
        const counters = await insertRulesBatch(supabase, rules, version.id, "imported");

        await finalizeRun(supabase, run.id, "completed", counters);

        return jsonResponse({
          status: "completed",
          source_type: "manual_json",
          source_name: feed.name,
          version: versionLabel,
          version_id: version.id,
          counters,
        });
      } catch (err) {
        await finalizeRun(supabase, run.id, "error", null, err.message);
        return jsonResponse({ status: "error", error: err.message }, 500);
      }
    }

    // ─── MANUAL_CSV import ───
    if (sourceType === "manual_csv") {
      const sourceName = (body.source_name as string) || "importação-csv";
      const csv = body.csv as string;

      if (!csv || typeof csv !== "string" || csv.trim().length === 0) {
        return jsonResponse({ error: "Campo 'csv' obrigatório e deve ser string CSV." }, 400);
      }

      const csvRows = parseCsv(csv);
      if (csvRows.length === 0) {
        return jsonResponse({ error: "CSV vazio ou sem linhas válidas." }, 400);
      }

      const rules = csvRowsToRules(csvRows);
      const feed = await getOrCreateFeed(supabase, sourceName, "manual_csv");
      const run = await createRun(supabase, feed.id);

      try {
        const { version, versionLabel } = await createVersionAndDeactivateOld(supabase, feed.id, feed.name);
        const counters = await insertRulesBatch(supabase, rules, version.id, "imported");

        await finalizeRun(supabase, run.id, "completed", counters);

        return jsonResponse({
          status: "completed",
          source_type: "manual_csv",
          source_name: feed.name,
          version: versionLabel,
          version_id: version.id,
          counters,
          csv_rows_parsed: csvRows.length,
        });
      } catch (err) {
        await finalizeRun(supabase, run.id, "error", null, err.message);
        return jsonResponse({ status: "error", error: err.message }, 500);
      }
    }

    // ─── REMOTE_JSON (existing feed sync) ───
    const { data: feeds, error: feedError } = await supabase
      .from("source_feeds")
      .select("*")
      .eq("is_active", true)
      .eq("state", "SP")
      .eq("source_type", "remote_json");

    if (feedError) throw feedError;

    if (!feeds || feeds.length === 0) {
      return jsonResponse({ message: "Nenhuma fonte remote_json ativa encontrada." });
    }

    const results = [];

    for (const feed of feeds) {
      const run = await createRun(supabase, feed.id);

      try {
        if (!feed.url) {
          throw new Error(`Feed "${feed.name}" não possui URL configurada.`);
        }

        const response = await fetch(feed.url, { headers: { Accept: "application/json" } });
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status} ${response.statusText} from ${feed.url}`);
        }

        const rawData = await response.json();
        const sourceRules = extractRulesFromJson(rawData);

        if (sourceRules.length === 0) {
          throw new Error("Fonte retornou 0 regras. Abortando para segurança dos dados.");
        }

        const { version, versionLabel } = await createVersionAndDeactivateOld(supabase, feed.id, feed.name);
        const counters = await insertRulesBatch(supabase, sourceRules, version.id, "imported");

        await finalizeRun(supabase, run.id, "completed", counters);

        results.push({
          feed: feed.name,
          status: "completed",
          version: versionLabel,
          counters,
        });
      } catch (innerErr) {
        await finalizeRun(supabase, run.id, "error", null, innerErr.message);
        results.push({ feed: feed.name, status: "error", error: innerErr.message });
      }
    }

    return jsonResponse({ results });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});

// ── Helper: get or create a source feed ──
async function getOrCreateFeed(
  supabase: ReturnType<typeof createClient>,
  name: string,
  sourceType: string
) {
  const { data: existing } = await supabase
    .from("source_feeds")
    .select("*")
    .eq("name", name)
    .eq("source_type", sourceType)
    .limit(1)
    .single();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("source_feeds")
    .insert({
      name,
      source_type: sourceType,
      state: "SP",
      is_active: true,
      description: `Fonte ${sourceType}: ${name}`,
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}

// ── Helper: create a run ──
async function createRun(supabase: ReturnType<typeof createClient>, feedId: string) {
  const { data, error } = await supabase
    .from("source_update_runs")
    .insert({
      source_feed_id: feedId,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Helper: finalize a run ──
async function finalizeRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  status: string,
  counters?: ImportCounters | null,
  errorMessage?: string
) {
  await supabase
    .from("source_update_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_processed: counters?.inserted ?? 0,
      error_message: errorMessage || (counters?.failed ? `${counters.failed} registros falharam` : null),
    })
    .eq("id", runId);
}
