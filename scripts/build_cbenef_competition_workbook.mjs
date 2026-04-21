import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

function getRuntimeArtifactToolUrl() {
  const runtimeRoot =
    process.env.CODEX_PRIMARY_RUNTIME ||
    path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime");
  const toolPath = path.join(
    runtimeRoot,
    "dependencies",
    "node",
    "node_modules",
    "@oai",
    "artifact-tool",
    "dist",
    "artifact_tool.mjs",
  );
  return pathToFileURL(toolPath).href;
}

function columnLetter(index) {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function buildMatrix(columns, rows) {
  return [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
}

function applyHeaderStyle(range) {
  range.format = {
    fill: "#0F172A",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
}

function setColumnWidths(sheet, columnWidths, rowCount) {
  columnWidths.forEach((width, index) => {
    const col = columnLetter(index);
    sheet.getRange(`${col}1:${col}${Math.max(rowCount, 1)}`).format.columnWidthPx = width;
  });
}

function addDataSheet(workbook, name, columns, rows, columnWidths) {
  const sheet = workbook.worksheets.add(name);
  if (!rows.length) {
    sheet.getRange("A1").values = [["Nenhum registro"]];
    return sheet;
  }

  const matrix = buildMatrix(columns, rows);
  const endColumn = columnLetter(columns.length - 1);
  const endRow = matrix.length;
  const range = sheet.getRange(`A1:${endColumn}${endRow}`);
  range.values = matrix;
  applyHeaderStyle(sheet.getRange(`A1:${endColumn}1`));
  sheet.freezePanes.freezeRows(1);
  setColumnWidths(sheet, columnWidths, endRow);
  sheet.getRange(`A2:${endColumn}${endRow}`).format.wrapText = true;

  const tableName = `${name.replace(/[^A-Za-z0-9]/g, "") || "Competition"}Table`;
  sheet.tables.add(`A1:${endColumn}${endRow}`, true, tableName);
  return sheet;
}

function addSummarySheet(workbook, payload) {
  const sheet = workbook.worksheets.add("Resumo");
  sheet.showGridLines = false;

  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [["Diagnostico da competicao de regras - get-cbenef"]];
  sheet.getRange("A1:H1").format = {
    fill: "#1E293B",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };

  const metadata = [
    ["Base de entrada", payload.source_file],
    ["Aba lida", payload.source_sheet],
    ["Tamanho da amostra", payload.sample_size],
    ["Seam diagnostica", payload.diagnostic_seam.description],
    ["Fluxo real de referencia", payload.diagnostic_seam.real_flow_reference],
    ["Correspondencia seam x motor", `${payload.diagnostic_seam.winner_matches_motor_count}/${payload.diagnostic_seam.winner_matches_motor_total}`],
  ];
  sheet.getRange("A3:B8").values = metadata;
  sheet.getRange("A3:A8").format = {
    fill: "#E2E8F0",
    font: { bold: true, color: "#0F172A" },
  };
  sheet.getRange("B3:B8").format.wrapText = true;

  const pathCounts = payload.path_counts;
  const pathRows = [
    ["Caminho", "Quantidade"],
    ["Exato", pathCounts.exact || 0],
    ["Prefixo 6", pathCounts.prefix_6 || 0],
    ["Prefixo 4", pathCounts.prefix_4 || 0],
    ["Prefixo 2", pathCounts.prefix_2 || 0],
    ["Sem regra", pathCounts.none || 0],
  ];
  sheet.getRange("D3:E8").values = pathRows;
  applyHeaderStyle(sheet.getRange("D3:E3"));

  const factorRows = [
    ["Fator", "Quantidade"],
    ...Object.entries(payload.factor_counts || {}).map(([factor, count]) => [factor, count]),
  ];
  const factorEndRow = 10 + factorRows.length - 1;
  sheet.getRange(`D10:E${factorEndRow}`).values = factorRows;
  applyHeaderStyle(sheet.getRange("D10:E10"));

  const governance = payload.governance_fields_available || {};
  const governanceRows = [
    ["Campo de governanca", "Disponivel na regra carregada?"],
    ...Object.entries(governance).map(([field, available]) => [field, available ? "SIM" : "NAO"]),
  ];
  const governanceEndRow = 10 + governanceRows.length - 1;
  sheet.getRange(`A10:B${governanceEndRow}`).values = governanceRows;
  applyHeaderStyle(sheet.getRange("A10:B10"));

  const executive = payload.executive_summary;
  const execRows = [
    ["Pergunta", "Leitura executiva"],
    ["Cobertura fraca da base?", executive.coverage_weak_base],
    ["Disputa excessiva por prefixo?", executive.excessive_prefix_competition],
    ["Ausencia de filtro de governanca?", executive.missing_governance_filter_before_ranking],
    ["Ranking semantico escolhendo mal?", executive.semantic_ranking_choosing_poorly],
    ["Leitura combinada", executive.combined_assessment],
    ["Sinal do proximo passo", executive.dominant_next_step_signal],
  ];
  const execEndRow = 22 + execRows.length - 1;
  sheet.getRange(`A22:B${execEndRow}`).values = execRows;
  applyHeaderStyle(sheet.getRange("A22:B22"));
  sheet.getRange(`B23:B${execEndRow}`).format.wrapText = true;

  sheet.getRange("A1:A40").format.columnWidthPx = 260;
  sheet.getRange("B1:B40").format.columnWidthPx = 520;
  sheet.getRange("D1:D40").format.columnWidthPx = 220;
  sheet.getRange("E1:E40").format.columnWidthPx = 140;

  for (let row = 23; row <= execEndRow; row += 1) {
    sheet.getRange(`A${row}:B${row}`).format.rowHeightPx = 42;
  }
}

async function main() {
  const [, , ...argv] = process.argv;
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !value) {
      continue;
    }
    args.set(key, value);
  }

  const inputJson = args.get("--input-json");
  const outputXlsx = args.get("--output-xlsx");
  if (!inputJson || !outputXlsx) {
    throw new Error("Usage: node build_cbenef_competition_workbook.mjs --input-json <file> --output-xlsx <file>");
  }

  const artifactTool = await import(getRuntimeArtifactToolUrl());
  const { Workbook, SpreadsheetFile } = artifactTool;

  const payload = JSON.parse(await fs.readFile(inputJson, "utf8"));
  const workbook = Workbook.create();
  addSummarySheet(workbook, payload);

  const itemWidths = [
    80, 70, 70, 120, 240, 110, 260, 120, 140, 110, 90, 100, 100, 120, 130, 160, 340, 130, 120, 120,
    90, 90, 90, 120, 100, 130, 110, 80, 90, 80, 80, 120, 120, 320, 150, 120, 120, 100, 80, 120, 120,
    120, 120, 120, 120, 120, 100, 100, 120, 120, 120, 120, 120, 100, 100, 160,
  ];
  const candidateWidths = [
    80, 70, 70, 260, 110, 80, 100, 100, 80, 80, 80, 120, 110, 120, 100, 100, 100, 80, 100, 80, 80,
    120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 90, 220, 80, 180, 100, 100, 120, 150,
  ];

  addDataSheet(workbook, "Itens", payload.item_columns, payload.item_rows, itemWidths);
  addDataSheet(workbook, "Ranking", payload.candidate_columns, payload.candidate_rows, candidateWidths);

  await fs.mkdir(path.dirname(outputXlsx), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputXlsx);
}

await main();
