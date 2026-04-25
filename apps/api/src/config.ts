function normalizeText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePort(value: string | undefined, fallback: number): number {
  const normalized = normalizeText(value);

  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  const normalized = normalizeText(value);

  if (!normalized) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(normalized.toLowerCase());
}

export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string | null;
  databaseSsl: boolean;
}

const host = normalizeText(process.env.API_HOST) ?? "0.0.0.0";

export const config: ApiConfig = {
  host,
  port: parsePort(process.env.PORT, 3001),
  databaseUrl: normalizeText(process.env.DATABASE_URL),
  databaseSsl: parseBoolean(process.env.DATABASE_SSL),
};
