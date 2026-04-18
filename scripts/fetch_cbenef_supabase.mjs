import fs from "node:fs/promises";
import path from "node:path";

function parseEnvFile(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    result[key] = value;
  }
  return result;
}

async function loadConfig() {
  const envFromFile = await fs
    .readFile(path.join(process.cwd(), ".env"), "utf8")
    .then(parseEnvFile)
    .catch(() => ({}));
  const env = { ...envFromFile, ...process.env };
  const baseUrl = (env.VITE_SUPABASE_URL || "").trim();
  const apiKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!baseUrl || !apiKey) {
    throw new Error("Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function fetchJsonPage(baseUrl, table, params, headers) {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function fetchAllTable(baseUrl, table, headers, { select = "*", filters = {}, pageSize = 1000 } = {}) {
  const rows = [];
  let offset = 0;
  while (true) {
    const page = await fetchJsonPage(baseUrl, table, {
      select,
      limit: pageSize,
      offset,
      ...filters,
    }, headers);
    if (!Array.isArray(page)) {
      throw new Error(`Unexpected payload for ${table}`);
    }
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }
  return rows;
}

async function main() {
  const args = new Map();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key && value) {
      args.set(key, value);
    }
  }

  const outputJson = args.get("--output-json");
  if (!outputJson) {
    throw new Error("Usage: node fetch_cbenef_supabase.mjs --output-json <file>");
  }

  const { baseUrl, apiKey } = await loadConfig();
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const [classificationGroups, classificationGroupKeywords, cbenefRules] = await Promise.all([
    fetchAllTable(baseUrl, "classification_groups", headers, {
      select: "id,code,parent_id,level",
      filters: { is_active: "eq.true" },
    }),
    fetchAllTable(baseUrl, "classification_group_keywords", headers, {
      select: "group_id,keyword,match_type,weight",
    }),
    fetchAllTable(baseUrl, "cbenef_rules", headers, {
      select: "*",
      filters: { is_active: "eq.true" },
    }),
  ]);

  const payload = {
    generated_at: new Date().toISOString(),
    source: `${baseUrl}`,
    classification_groups: classificationGroups,
    classification_group_keywords: classificationGroupKeywords,
    cbenef_rules: cbenefRules,
  };

  await fs.mkdir(path.dirname(outputJson), { recursive: true });
  await fs.writeFile(outputJson, JSON.stringify(payload, null, 2), "utf8");
}

await main();
