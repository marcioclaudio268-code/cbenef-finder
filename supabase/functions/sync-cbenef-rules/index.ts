import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  DEFAULT_STATE,
  ImportValidationError,
  csvRowsToRules,
  extractImportDataFromJson,
  parseCsv,
  prepareImport,
  readOptionalString,
  toErrorMessage,
} from "./importer.ts";
import type { ImportPayload, PreparedImport, PreparedRule, SourceType } from "./importer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;

interface ImportCounters {
  processed: number;
  inserted: number;
  failed: number;
  activated: number;
  deactivated: number;
}

interface ImportIntegrity {
  expected_rules: number;
  staged_rules: number;
  activated_rules: number;
  inactive_rules: number;
  previous_versions_deactivated: number;
  previous_active_rules_deactivated: number;
  version_current: boolean;
}

interface PromotionContext {
  previousVersionIds: string[];
  previousCurrentVersionIds: string[];
  previousActiveRuleIds: string[];
}

async function createStagedVersion(
  supabase: ReturnType<typeof createClient>,
  feedId: string,
  preparedImport: PreparedImport,
) {
  const { error } = await supabase.from("rule_versions").insert({
    id: preparedImport.version.id,
    source_feed_id: feedId,
    version_label: preparedImport.version.versionLabel,
    version_code: preparedImport.version.versionCode,
    published_at: preparedImport.version.publishedAt,
    is_current: false,
  });

  if (error) {
    throw new Error(`Falha ao criar rule_version: ${error.message}`);
  }
}

async function insertRulesBatch(
  supabase: ReturnType<typeof createClient>,
  rules: PreparedRule[],
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rules.length; i += BATCH_SIZE) {
    const batch = rules.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("cbenef_rules")
      .insert(batch.map((rule) => rule.row))
      .select("id");

    if (error) {
      throw new Error(`Falha ao inserir lote na posicao ${i}: ${error.message}`);
    }

    if ((data?.length ?? 0) !== batch.length) {
      throw new Error(
        `Lote inserido de forma inconsistente na posicao ${i}: esperado ${batch.length}, recebido ${data?.length ?? 0}.`,
      );
    }

    inserted += batch.length;
  }

  return inserted;
}

async function updateRuleActivationByIds(
  supabase: ReturnType<typeof createClient>,
  ruleIds: string[],
  isActive: boolean,
) {
  for (let i = 0; i < ruleIds.length; i += BATCH_SIZE) {
    const batch = ruleIds.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("cbenef_rules")
      .update({ is_active: isActive })
      .in("id", batch);

    if (error) {
      throw new Error(`Falha ao atualizar ativacao das regras: ${error.message}`);
    }
  }
}

async function collectPromotionContext(
  supabase: ReturnType<typeof createClient>,
  feedId: string,
  newVersionId: string,
): Promise<PromotionContext> {
  const { data: previousVersions, error: versionsError } = await supabase
    .from("rule_versions")
    .select("id, is_current")
    .eq("source_feed_id", feedId)
    .neq("id", newVersionId);

  if (versionsError) {
    throw new Error(`Falha ao consultar versoes anteriores: ${versionsError.message}`);
  }

  const previousVersionIds = (previousVersions ?? []).map((version) => version.id);
  const previousCurrentVersionIds = (previousVersions ?? [])
    .filter((version) => version.is_current)
    .map((version) => version.id);

  let previousActiveRuleIds: string[] = [];
  if (previousVersionIds.length > 0) {
    const { data: previousActiveRules, error: rulesError } = await supabase
      .from("cbenef_rules")
      .select("id")
      .in("rule_version_id", previousVersionIds)
      .eq("is_active", true);

    if (rulesError) {
      throw new Error(`Falha ao consultar regras ativas anteriores: ${rulesError.message}`);
    }

    previousActiveRuleIds = (previousActiveRules ?? []).map((rule) => rule.id);
  }

  return {
    previousVersionIds,
    previousCurrentVersionIds,
    previousActiveRuleIds,
  };
}

async function rollbackPromotion(
  supabase: ReturnType<typeof createClient>,
  newVersionId: string,
  newActiveRuleIds: string[],
  context: PromotionContext,
) {
  try {
    if (newActiveRuleIds.length > 0) {
      await updateRuleActivationByIds(supabase, newActiveRuleIds, false);
    }

    const { error: newVersionError } = await supabase
      .from("rule_versions")
      .update({ is_current: false })
      .eq("id", newVersionId);

    if (newVersionError) {
      throw newVersionError;
    }

    if (context.previousCurrentVersionIds.length > 0) {
      const { error: previousVersionError } = await supabase
        .from("rule_versions")
        .update({ is_current: true })
        .in("id", context.previousCurrentVersionIds);

      if (previousVersionError) {
        throw previousVersionError;
      }
    }

    if (context.previousActiveRuleIds.length > 0) {
      await updateRuleActivationByIds(supabase, context.previousActiveRuleIds, true);
    }
  } catch (rollbackError) {
    console.error("Rollback da promocao falhou:", toErrorMessage(rollbackError));
  }
}

async function promoteVersion(
  supabase: ReturnType<typeof createClient>,
  feedId: string,
  preparedImport: PreparedImport,
): Promise<PromotionContext> {
  const context = await collectPromotionContext(supabase, feedId, preparedImport.version.id);

  try {
    if (context.previousActiveRuleIds.length > 0) {
      await updateRuleActivationByIds(supabase, context.previousActiveRuleIds, false);
    }

    if (context.previousVersionIds.length > 0) {
      const { error: previousVersionsError } = await supabase
        .from("rule_versions")
        .update({ is_current: false })
        .in("id", context.previousVersionIds);

      if (previousVersionsError) {
        throw new Error(`Falha ao desativar versoes anteriores: ${previousVersionsError.message}`);
      }
    }

    await updateRuleActivationByIds(supabase, preparedImport.activeRuleIds, true);

    const { error: activateVersionError } = await supabase
      .from("rule_versions")
      .update({ is_current: true })
      .eq("id", preparedImport.version.id);

    if (activateVersionError) {
      throw new Error(`Falha ao ativar nova versao: ${activateVersionError.message}`);
    }

    return context;
  } catch (error) {
    await rollbackPromotion(supabase, preparedImport.version.id, preparedImport.activeRuleIds, context);
    throw error;
  }
}

async function cleanupStagedVersion(supabase: ReturnType<typeof createClient>, versionId: string) {
  const { error } = await supabase.from("rule_versions").delete().eq("id", versionId);
  if (error) {
    console.error("Falha ao limpar rule_version staged:", error.message);
  }
}

async function executePreparedImport(
  supabase: ReturnType<typeof createClient>,
  feed: { id: string; name: string },
  preparedImport: PreparedImport,
): Promise<{ counters: ImportCounters; integrity: ImportIntegrity }> {
  await createStagedVersion(supabase, feed.id, preparedImport);

  try {
    const inserted = await insertRulesBatch(supabase, preparedImport.rules);
    const promotionContext = await promoteVersion(supabase, feed.id, preparedImport);

    const counters: ImportCounters = {
      processed: preparedImport.rules.length,
      inserted,
      failed: 0,
      activated: preparedImport.activeRuleIds.length,
      deactivated: promotionContext.previousActiveRuleIds.length,
    };

    const integrity: ImportIntegrity = {
      expected_rules: preparedImport.rules.length,
      staged_rules: inserted,
      activated_rules: preparedImport.activeRuleIds.length,
      inactive_rules: preparedImport.rules.length - preparedImport.activeRuleIds.length,
      previous_versions_deactivated: promotionContext.previousVersionIds.length,
      previous_active_rules_deactivated: promotionContext.previousActiveRuleIds.length,
      version_current: true,
    };

    return { counters, integrity };
  } catch (error) {
    await cleanupStagedVersion(supabase, preparedImport.version.id);
    throw error;
  }
}

async function getOrCreateFeed(
  supabase: ReturnType<typeof createClient>,
  name: string,
  sourceType: string,
) {
  const { data: existing, error: existingError } = await supabase
    .from("source_feeds")
    .select("*")
    .eq("name", name)
    .eq("source_type", sourceType)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("source_feeds")
    .insert({
      name,
      source_type: sourceType,
      state: DEFAULT_STATE,
      is_active: true,
      description: `Fonte ${sourceType}: ${name}`,
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}

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

async function finalizeRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  status: string,
  counters?: ImportCounters | null,
  errorMessage?: string,
) {
  await supabase
    .from("source_update_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_processed: counters?.processed ?? 0,
      error_message: errorMessage || (counters?.failed ? `${counters.failed} registros falharam` : null),
    })
    .eq("id", runId);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let body: ImportPayload = {};
    try {
      body = (await req.json()) as ImportPayload;
    } catch {
      body = {};
    }

    const sourceType = (readOptionalString(body.source_type) ?? "remote_json") as SourceType;
    if (!["remote_json", "manual_json", "manual_csv"].includes(sourceType)) {
      return jsonResponse({ error: `source_type invalido: ${sourceType}` }, 400);
    }

    if (sourceType === "manual_json") {
      if (!Array.isArray(body.rules) || body.rules.length === 0) {
        return jsonResponse({ error: "Campo 'rules' obrigatorio e deve ser array nao vazio." }, 400);
      }

      const sourceName = readOptionalString(body.source_name) ?? "importacao-manual";

      try {
        const preparedImport = prepareImport(sourceName, body.rules, body, "imported");
        const feed = await getOrCreateFeed(supabase, sourceName, "manual_json");
        const run = await createRun(supabase, feed.id);

        try {
          const { counters, integrity } = await executePreparedImport(supabase, feed, preparedImport);
          await finalizeRun(supabase, run.id, "completed", counters);

          return jsonResponse({
            status: "completed",
            source_type: "manual_json",
            source_name: feed.name,
            version: preparedImport.version.versionLabel,
            version_id: preparedImport.version.id,
            version_code: preparedImport.version.versionCode,
            counters,
            integrity,
          });
        } catch (error) {
          const message = toErrorMessage(error);
          await finalizeRun(supabase, run.id, "error", null, message);
          return jsonResponse({ status: "error", error: message }, 500);
        }
      } catch (error) {
        if (error instanceof ImportValidationError) {
          return jsonResponse(
            {
              status: "error",
              error: error.message,
              validation_issues: error.issues,
            },
            error.status,
          );
        }

        throw error;
      }
    }

    if (sourceType === "manual_csv") {
      const csv = readOptionalString(body.csv);
      if (!csv) {
        return jsonResponse({ error: "Campo 'csv' obrigatorio e deve ser string CSV." }, 400);
      }

      const csvRows = parseCsv(csv);
      if (csvRows.length === 0) {
        return jsonResponse({ error: "CSV vazio ou sem linhas validas." }, 400);
      }

      const sourceName = readOptionalString(body.source_name) ?? "importacao-csv";
      const sourceRules = csvRowsToRules(csvRows);

      try {
        const preparedImport = prepareImport(sourceName, sourceRules, body, "imported");
        const feed = await getOrCreateFeed(supabase, sourceName, "manual_csv");
        const run = await createRun(supabase, feed.id);

        try {
          const { counters, integrity } = await executePreparedImport(supabase, feed, preparedImport);
          await finalizeRun(supabase, run.id, "completed", counters);

          return jsonResponse({
            status: "completed",
            source_type: "manual_csv",
            source_name: feed.name,
            version: preparedImport.version.versionLabel,
            version_id: preparedImport.version.id,
            version_code: preparedImport.version.versionCode,
            counters,
            integrity,
            csv_rows_parsed: csvRows.length,
          });
        } catch (error) {
          const message = toErrorMessage(error);
          await finalizeRun(supabase, run.id, "error", null, message);
          return jsonResponse({ status: "error", error: message }, 500);
        }
      } catch (error) {
        if (error instanceof ImportValidationError) {
          return jsonResponse(
            {
              status: "error",
              error: error.message,
              validation_issues: error.issues,
            },
            error.status,
          );
        }

        throw error;
      }
    }

    const { data: feeds, error: feedError } = await supabase
      .from("source_feeds")
      .select("*")
      .eq("is_active", true)
      .eq("state", DEFAULT_STATE)
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
          throw new Error(`Feed "${feed.name}" nao possui URL configurada.`);
        }

        const response = await fetch(feed.url, { headers: { Accept: "application/json" } });
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status} ${response.statusText} from ${feed.url}`);
        }

        const rawData = await response.json();
        const extracted = extractImportDataFromJson(rawData);

        if (extracted.rules.length === 0) {
          throw new ImportValidationError(
            "Fonte retornou 0 regras. Abortando para seguranca dos dados.",
            [],
          );
        }

        const preparedImport = prepareImport(feed.name, extracted.rules, extracted.versionMetadata, "imported");
        const { counters, integrity } = await executePreparedImport(supabase, feed, preparedImport);
        await finalizeRun(supabase, run.id, "completed", counters);

        results.push({
          feed: feed.name,
          status: "completed",
          version: preparedImport.version.versionLabel,
          version_id: preparedImport.version.id,
          version_code: preparedImport.version.versionCode,
          counters,
          integrity,
        });
      } catch (error) {
        const message = toErrorMessage(error);
        await finalizeRun(supabase, run.id, "error", null, message);
        results.push({
          feed: feed.name,
          status: "error",
          error: message,
          validation_issues: error instanceof ImportValidationError ? error.issues : undefined,
        });
      }
    }

    return jsonResponse({ results });
  } catch (error) {
    return jsonResponse({ error: toErrorMessage(error) }, 500);
  }
});
