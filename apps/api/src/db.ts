import { performance } from "node:perf_hooks";
import { Pool } from "pg";

export type DatabasePingStatus = "connected" | "unconfigured" | "unavailable";
export type QueryLogResponseMode = "placeholder" | "resolved" | "low_confidence" | "error";

export interface DatabasePingResult {
  configured: boolean;
  status: DatabasePingStatus;
  latencyMs?: number;
  error?: string;
}

export interface QueryLogEntry {
  id: string;
  routeName: string;
  ean: string | null;
  description: string | null;
  ncm: string | null;
  cstIcms: string | null;
  brand: string | null;
  suggestedCbenef: string | null;
  confidenceScore: number | null;
  confidenceLevel: "high" | "medium" | "low" | null;
  matchedBy: string | null;
  responseMode: QueryLogResponseMode;
  matchedRuleId: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
}

export interface QueryLogStoreResult {
  stored: boolean;
  reason: string | null;
}

export interface Database {
  isConfigured: boolean;
  ping: () => Promise<DatabasePingResult>;
  logQuery: (entry: QueryLogEntry) => Promise<QueryLogStoreResult>;
  close: () => Promise<void>;
}

function normalizeDatabaseUrl(databaseUrl: string | null): string | null {
  if (typeof databaseUrl !== "string") {
    return null;
  }

  const trimmed = databaseUrl.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createDatabase(databaseUrl: string | null, databaseSsl: boolean): Database {
  const normalizedUrl = normalizeDatabaseUrl(databaseUrl);
  const pool = normalizedUrl
    ? new Pool({
        connectionString: normalizedUrl,
        ssl: databaseSsl ? { rejectUnauthorized: false } : undefined,
        max: 5,
        idleTimeoutMillis: 30_000,
      })
    : null;

  return {
    isConfigured: pool !== null,

    async ping() {
      if (!pool) {
        return {
          configured: false,
          status: "unconfigured",
        };
      }

      const startedAt = performance.now();

      try {
        await pool.query("select 1 as ok");
        return {
          configured: true,
          status: "connected",
          latencyMs: Math.round(performance.now() - startedAt),
        };
      } catch (error) {
        return {
          configured: true,
          status: "unavailable",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async logQuery(entry) {
      if (!pool) {
        return {
          stored: false,
          reason: "database_unconfigured",
        };
      }

      try {
        await pool.query(
          `insert into public.query_logs (
            id,
            route_name,
            ean,
            description,
            ncm,
            cst_icms,
            brand,
            suggested_cbenef,
            confidence_score,
            confidence_level,
            matched_by,
            response_mode,
            matched_rule_id,
            request_payload,
            response_payload
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )`,
          [
            entry.id,
            entry.routeName,
            entry.ean,
            entry.description,
            entry.ncm,
            entry.cstIcms,
            entry.brand,
            entry.suggestedCbenef,
            entry.confidenceScore,
            entry.confidenceLevel,
            entry.matchedBy,
            entry.responseMode,
            entry.matchedRuleId,
            entry.requestPayload,
            entry.responsePayload,
          ],
        );

        return {
          stored: true,
          reason: null,
        };
      } catch (error) {
        return {
          stored: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async close() {
      if (pool) {
        await pool.end();
      }
    },
  };
}
