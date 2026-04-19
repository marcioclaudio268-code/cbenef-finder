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

  const tableName = `${name.replace(/[^A-Za-z0-9]/g, "") || "Sample"}Table`;
  sheet.tables.add(`A1:${endColumn}${endRow}`, true, tableName);
  return sheet;
}

function addSummarySheet(workbook, payload) {
  const sheet = workbook.worksheets.add("Resumo");
  sheet.showGridLines = false;

  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [["Amostra validação get-cbenef - fluxo real"]];
  sheet.getRange("A1:H1").format = {
    fill: "#1E293B",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };

  const metadata = [
    ["Base de entrada", payload.source_file],
    ["Aba lida", payload.source_sheet],
    ["Tamanho da amostra", payload.sample_definition.sample_size],
    ["Critério da amostra", payload.sample_definition.summary],
    ["Fluxo real usado", payload.real_flow.description],
    ["TRIB", "Campo apenas informativo"],
    ["Hipótese seam x handler", payload.hypothesis_assessment.verdict],
  ];
  sheet.getRange("A3:B9").values = metadata;
  sheet.getRange("A3:A9").format = {
    fill: "#E2E8F0",
    font: { bold: true, color: "#0F172A" },
  };
  sheet.getRange("B3:B9").format.wrapText = true;

  const handler = payload.handler_counts;
  const seam = payload.seam_counts;
  const countRows = [
    ["Fonte", "BATEU", "DIVERGIU", "INCONCLUSIVO"],
    ["Handler real", handler.BATEU || 0, handler.DIVERGIU || 0, handler.INCONCLUSIVO || 0],
    ["Seam local", seam.BATEU || 0, seam.DIVERGIU || 0, seam.INCONCLUSIVO || 0],
  ];
  sheet.getRange("D3:G5").values = countRows;
  applyHeaderStyle(sheet.getRange("D3:G3"));

  const alignment = payload.handler_vs_seam;
  const alignmentRows = [
    ["Métrica", "Quantidade"],
    ["Mesma classificação", alignment.same_status_count || 0],
    ["Mesma saída em escopo", alignment.same_scoped_payload_count || 0],
    ["Itens com diferença", alignment.different_items_count || 0],
  ];
  sheet.getRange("D8:E11").values = alignmentRows;
  applyHeaderStyle(sheet.getRange("D8:E8"));

  const fieldRows = [
    ["Campo", "Divergências no handler", "Diferenças handler x seam"],
    ...Object.keys(payload.handler_field_divergences).map((field) => [
      field,
      payload.handler_field_divergences[field] || 0,
      payload.handler_vs_seam.field_differences[field] || 0,
    ]),
  ];
  const fieldEndRow = 12 + fieldRows.length - 1;
  sheet.getRange(`A12:C${fieldEndRow}`).values = fieldRows;
  applyHeaderStyle(sheet.getRange("A12:C12"));

  sheet.getRange("A20:H23").merge();
  sheet.getRange("A20").values = [[
    payload.hypothesis_assessment.reasoning,
  ]];
  sheet.getRange("A20:H23").format = {
    fill: "#F8FAFC",
    font: { italic: true, color: "#334155" },
    wrapText: true,
    verticalAlignment: "top",
  };

  sheet.getRange("A1:A24").format.columnWidthPx = 220;
  sheet.getRange("B1:B24").format.columnWidthPx = 420;
  sheet.getRange("C1:C24").format.columnWidthPx = 180;
  sheet.getRange("D1:D24").format.columnWidthPx = 150;
  sheet.getRange("E1:E24").format.columnWidthPx = 130;
  sheet.getRange("F1:F24").format.columnWidthPx = 130;
  sheet.getRange("G1:G24").format.columnWidthPx = 130;
  sheet.getRange("H1:H24").format.columnWidthPx = 240;
  sheet.getRange("A20:H23").format.rowHeightPx = 66;
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
    throw new Error("Usage: node build_cbenef_sample_workbook.mjs --input-json <file> --output-xlsx <file>");
  }

  const artifactTool = await import(getRuntimeArtifactToolUrl());
  const { Workbook, SpreadsheetFile } = artifactTool;

  const payload = JSON.parse(await fs.readFile(inputJson, "utf8"));
  const workbook = Workbook.create();

  addSummarySheet(workbook, payload);

  const widths = [
    70, 90, 170, 120, 120, 100, 110, 250, 120, 120, 120, 120, 100, 100, 100, 100, 100, 100,
    120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 130, 130, 170, 260, 260, 140, 220,
  ];

  addDataSheet(workbook, "Amostra", payload.columns, payload.rows, widths);
  addDataSheet(
    workbook,
    "BATEU",
    payload.columns,
    payload.rows.filter((row) => row.status_handler_real === "BATEU"),
    widths,
  );
  addDataSheet(
    workbook,
    "DIVERGIU",
    payload.columns,
    payload.rows.filter((row) => row.status_handler_real === "DIVERGIU"),
    widths,
  );
  addDataSheet(
    workbook,
    "INCONCLUSIVO",
    payload.columns,
    payload.rows.filter((row) => row.status_handler_real === "INCONCLUSIVO"),
    widths,
  );

  await fs.mkdir(path.dirname(outputXlsx), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputXlsx);
}

await main();
