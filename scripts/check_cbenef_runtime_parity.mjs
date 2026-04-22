import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
  const baseUrl = (env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!baseUrl || !apiKey) {
    throw new Error("Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { baseUrl, apiKey };
}

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { response, payload };
}

async function fetchSupabaseTables(outputDir) {
  const cachePath = path.join(outputDir, "supabase_tables.json");
  const result = spawnSync(
    "node",
    [path.join("scripts", "fetch_cbenef_supabase.mjs"), "--output-json", cachePath],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to fetch Supabase tables.\nSTDOUT:\n${result.stdout || ""}\nSTDERR:\n${result.stderr || ""}`,
    );
  }

  return JSON.parse(await fs.readFile(cachePath, "utf8"));
}

function buildRuleIndex(rules) {
  const exact = new Map();
  const prefix = new Map();

  for (const rule of rules) {
    const ncm = normalizeDigits(rule.ncm);
    if (!ncm) {
      continue;
    }

    if (!exact.has(ncm)) exact.set(ncm, []);
    exact.get(ncm).push(rule);

    for (const prefixLength of [6, 4, 2]) {
      if (ncm.length < prefixLength) continue;
      const key = ncm.slice(0, prefixLength);
      if (!prefix.has(key)) prefix.set(key, []);
      prefix.get(key).push(rule);
    }
  }

  return { exact, prefix };
}

function summarizeCurrentCodeExpectation(ncm, exactCount, prefixCount) {
  if (exactCount === 0 && prefixCount === 0) {
    return {
      path: "sem_regra_suficiente",
      expected_kind: "low_confidence",
      expected_matched_rule_id: null,
      expected_cbenef_code: "",
      expected_final_cst_icms: "",
      expected_output_cfop: "",
      expected_output_icms_rate: null,
      expected_confidence_level: "low",
      expected_matched_by_ncm_exact: false,
      expected_matched_by_ncm_prefix: false,
      expected_decision_reason: "Nenhuma regra encontrada.",
      expected_explanation: "Nao foi possivel encontrar uma regra correspondente para o NCM informado na base atual.",
      note: `O NCM ${ncm} nao encontra cobertura ativa.`,
    };
  }

  if (exactCount === 0 && prefixCount > 0) {
    return {
      path: "prefixo_apenas_contexto",
      expected_kind: "insufficient_rule",
      expected_matched_rule_id: null,
      expected_cbenef_code: "",
      expected_final_cst_icms: "",
      expected_output_cfop: "",
      expected_output_icms_rate: null,
      expected_confidence_level: "low",
      expected_matched_by_ncm_exact: false,
      expected_matched_by_ncm_prefix: true,
      expected_decision_reason: "Nao ha regra exata ativa para o NCM informado; o prefixo foi mantido apenas como contexto.",
      expected_explanation: "Foram encontradas regras por prefixo de NCM, mas o comparador conservador nao promove prefixo a resposta forte sem correspondencia exata.",
      note: `O NCM ${ncm} encontra apenas cobertura por prefixo; o codigo atual deve manter baixa confianca, nao promover regra.`,
    };
  }

  return {
    path: "caminho_exato_presente",
    expected_kind: "exact_path",
    expected_matched_rule_id: null,
    expected_cbenef_code: "",
    expected_final_cst_icms: "",
    expected_output_cfop: "",
    expected_output_icms_rate: null,
    expected_confidence_level: "low",
    expected_matched_by_ncm_exact: true,
    expected_matched_by_ncm_prefix: false,
    expected_decision_reason: "Regra exata ativa localizada.",
    expected_explanation: "O caso tem cobertura exata ativa e nao depende de prefixo.",
    note: `O NCM ${ncm} possui regra exata ativa; este caso nao deveria aparecer como prefixo.`,
  };
}

function compareCase(localExpectation, publicPayload) {
  const publicResponse = publicPayload?.response || publicPayload || {};
  const publicMatchedRuleId = publicResponse.matched_rule_id ?? null;
  const publicMatchedByPrefix = Boolean(publicResponse.matched_by_ncm_prefix);
  const publicMatchedByExact = Boolean(publicResponse.matched_by_ncm_exact);

  const publicPromoted = Boolean(publicResponse.cbenef_code || publicMatchedRuleId);
  const localShouldPromote = localExpectation.expected_kind === "exact_path";

  const aligned =
    localExpectation.expected_kind === "exact_path"
      ? publicMatchedByExact && !publicMatchedByPrefix
      : !publicPromoted && publicMatchedByPrefix === localExpectation.expected_matched_by_ncm_prefix;

  const divergences = [];
  if (localExpectation.expected_kind !== "exact_path" && publicPromoted) {
    divergences.push("public_promoted_rule");
  }
  if (localExpectation.expected_kind !== "exact_path" && publicMatchedRuleId !== null) {
    divergences.push("public_matched_rule_id_non_null");
  }
  if (localExpectation.expected_kind !== "exact_path" && publicResponse.confidence_level !== "low") {
    divergences.push("public_confidence_not_low");
  }
  if (localExpectation.expected_kind === "exact_path" && publicMatchedByPrefix) {
    divergences.push("public_used_prefix_path");
  }

  return {
    aligned,
    localShouldPromote,
    publicPromoted,
    divergences,
    publicSummary: {
      cbenef_code: publicResponse.cbenef_code ?? "",
      final_cst_icms: publicResponse.final_cst_icms ?? "",
      output_cfop: publicResponse.output_cfop ?? "",
      output_icms_rate: publicResponse.output_icms_rate ?? null,
      confidence_level: publicResponse.confidence_level ?? "",
      matched_rule_id: publicMatchedRuleId,
      matched_by_ncm_exact: publicMatchedByExact,
      matched_by_ncm_prefix: publicMatchedByPrefix,
      decision_reason: publicResponse.decision_reason ?? "",
      explanation: publicResponse.explanation ?? "",
      matched_ncm: publicResponse.matched_ncm ?? "",
    },
  };
}

function formatHeaderSubset(headers) {
  const wanted = [
    "server",
    "date",
    "content-type",
    "cf-ray",
    "cf-cache-status",
    "sb-project-ref",
    "sb-gateway-version",
    "sb-request-id",
    "x-deno-execution-id",
    "x-request-id",
    "x-sb-edge-region",
    "x-supabase-region",
    "x-edge-runtime-version",
    "x-supabase-version",
    "x-served-by",
    "endpoint-load-metrics",
  ];
  const selected = {};
  for (const name of wanted) {
    const value = headers.get(name);
    if (value) selected[name] = value;
  }
  return selected;
}

async function main() {
  const outputDir = path.join("outputs", "cbenef-runtime-parity");
  await fs.mkdir(outputDir, { recursive: true });

  const { baseUrl, apiKey } = await loadConfig();
  const tables = await fetchSupabaseTables(outputDir);
  const indexes = buildRuleIndex(tables.cbenef_rules || []);

  const cases = [
    {
      sample_id: "C01",
      descricao: "OSSO BUCO KG",
      ncm: "02011000",
    },
    {
      sample_id: "L02",
      descricao: "CHAMYTO ESCUDO GENIAL 130 GR",
      ncm: "04032000",
    },
  ];

  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const results = [];
  let capturedHeaders = null;

  for (const [index, request] of cases.entries()) {
    const exactRules = indexes.exact.get(normalizeDigits(request.ncm)) || [];
    let prefixRules = [];
    if (exactRules.length === 0) {
      for (const prefixLength of [6, 4, 2]) {
        const prefixKey = normalizeDigits(request.ncm).slice(0, prefixLength);
        const candidate = indexes.prefix.get(prefixKey) || [];
        if (candidate.length > 0) {
          prefixRules = candidate;
          break;
        }
      }
    }

    const localExpectation = summarizeCurrentCodeExpectation(
      request.ncm,
      exactRules.length,
      prefixRules.length,
    );

    const { response, payload } = await fetchJson(`${baseUrl}/functions/v1/get-cbenef`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        descricao: request.descricao,
        ncm: request.ncm,
      }),
    });

    if (index === 0) {
      capturedHeaders = formatHeaderSubset(response.headers);
    }

    const comparison = compareCase(localExpectation, payload);
    results.push({
      sample_id: request.sample_id,
      request,
      current_code_expectation: {
        exact_rule_count: exactRules.length,
        prefix_rule_count: prefixRules.length,
        ...localExpectation,
      },
      public_response: comparison.publicSummary,
      comparison: {
        aligned: comparison.aligned,
        local_should_promote: comparison.localShouldPromote,
        public_promoted: comparison.publicPromoted,
        divergences: comparison.divergences,
      },
    });
  }

  const conclusion =
    results.every((entry) => entry.comparison.aligned)
      ? "alinhado"
      : "desalinhado";

  const payload = {
    generated_at: new Date().toISOString(),
    source_commit: "23105ef01c6c6d3c928f6d2cd947047daaafb275",
    source: {
      base_url: baseUrl,
      endpoint: `${baseUrl}/functions/v1/get-cbenef`,
      cases: cases.length,
    },
    runtime_inspection: {
      public_response_headers: capturedHeaders || {},
      direct_version_header: capturedHeaders && Object.keys(capturedHeaders).find((key) => /commit|sha|git/i.test(key))
        ? Object.keys(capturedHeaders).find((key) => /commit|sha|git/i.test(key))
        : null,
      direct_version_value: capturedHeaders && Object.keys(capturedHeaders).find((key) => /commit|sha|git/i.test(key))
        ? capturedHeaders[Object.keys(capturedHeaders).find((key) => /commit|sha|git/i.test(key))]
        : null,
      note: "Nenhum identificador de commit/versao foi exposto no header publico observado.",
    },
    cases: results,
    conclusion,
  };

  const jsonPath = path.join(outputDir, "runtime_parity_report.json");
  const mdPath = path.join(outputDir, "runtime_parity_report.md");

  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const lines = [];
  lines.push("# Runtime Parity Report");
  lines.push("");
  lines.push(`- Source commit: \`${payload.source_commit}\``);
  lines.push(`- Public endpoint: \`${payload.source.endpoint}\``);
  lines.push(`- Conclusion: \`${conclusion}\``);
  lines.push("");
  lines.push("## Runtime Inspection");
  lines.push("");
  if (payload.runtime_inspection.direct_version_header) {
    lines.push(`- Version header: \`${payload.runtime_inspection.direct_version_header}\``);
    lines.push(`- Version value: \`${payload.runtime_inspection.direct_version_value}\``);
  } else {
    lines.push("- No commit/version header was exposed by the public function response.");
  }
  lines.push("");
  lines.push("## Case Comparison");
  lines.push("");
  lines.push("| Case | Local current-code expectation | Public response | Result |");
  lines.push("| --- | --- | --- | --- |");
  for (const entry of results) {
    const localLabel = `${entry.current_code_expectation.path} / exact=${entry.current_code_expectation.exact_rule_count} / prefix=${entry.current_code_expectation.prefix_rule_count}`;
    const publicLabel = [
      `matched_rule_id=${entry.public_response.matched_rule_id ?? "null"}`,
      `matched_by_ncm_prefix=${entry.public_response.matched_by_ncm_prefix}`,
      `confidence=${entry.public_response.confidence_level || "?"}`,
      `cbenef_code=${entry.public_response.cbenef_code || ""}`,
    ].join(", ");
    lines.push(`| ${entry.sample_id} | ${localLabel} | ${publicLabel} | ${entry.comparison.aligned ? "alinhado" : "desalinhado"} |`);
    lines.push(`|  | Local note: ${entry.current_code_expectation.note} | Public note: ${entry.public_response.decision_reason || "n/a"} | ${entry.comparison.divergences.join(", ") || "none"} |`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Cases analyzed: ${results.length}`);
  lines.push(`- Conclusion: ${conclusion}`);
  lines.push("");

  await fs.writeFile(mdPath, `${lines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, conclusion }, null, 2));
}

await main();
