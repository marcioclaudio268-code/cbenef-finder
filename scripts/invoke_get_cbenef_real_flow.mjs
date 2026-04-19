import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
  return { baseUrl, apiKey };
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key && value) {
      args.set(key, value);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputJson = args.get("--input-json");
  const outputJson = args.get("--output-json");

  if (!inputJson || !outputJson) {
    throw new Error(
      "Usage: node scripts/invoke_get_cbenef_real_flow.mjs --input-json <file> --output-json <file>",
    );
  }

  const { baseUrl, apiKey } = await loadConfig();
  const supabase = createClient(baseUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });

  const requests = JSON.parse(await fs.readFile(inputJson, "utf8"));
  if (!Array.isArray(requests)) {
    throw new Error("Input JSON must be an array.");
  }

  const responses = [];

  for (const request of requests) {
    const body = {
      descricao: request.descricao || undefined,
      ncm: request.ncm || undefined,
    };

    try {
      const { data, error } = await supabase.functions.invoke("get-cbenef", { body });
      responses.push({
        sample_id: request.sample_id,
        source_row: request.source_row,
        request: body,
        ok: !error,
        error: error ? { message: error.message, name: error.name } : null,
        response: error ? null : data,
      });
    } catch (error) {
      responses.push({
        sample_id: request.sample_id,
        source_row: request.source_row,
        request: body,
        ok: false,
        error: {
          name: error instanceof Error ? error.name : "InvokeError",
          message: error instanceof Error ? error.message : String(error),
        },
        response: null,
      });
    }
  }

  await fs.mkdir(path.dirname(outputJson), { recursive: true });
  await fs.writeFile(outputJson, JSON.stringify({
    generated_at: new Date().toISOString(),
    flow: "supabase.functions.invoke('get-cbenef')",
    source: baseUrl,
    responses,
  }, null, 2), "utf8");
}

await main();
