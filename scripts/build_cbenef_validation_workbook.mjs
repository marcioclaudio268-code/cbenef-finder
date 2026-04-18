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

  const tableName = `${name.replace(/[^A-Za-z0-9]/g, "") || "Validation"}Table`;
  sheet.tables.add(`A1:${endColumn}${endRow}`, true, tableName);
  return sheet;
}

function addSummarySheet(workbook, payload) {
  const sheet = workbook.worksheets.add("Resumo");
  sheet.showGridLines = false;

  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [["Validação híbrida da base consolidada"]];
  sheet.getRange("A1:H1").format = {
    fill: "#1E293B",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };

  const metadata = [
    ["Base de entrada", payload.source_file],
    ["Aba lida", payload.source_sheet],
    ["Seam aplicada", payload.seam],
    ["cBenef vazio", "Nao compara"],
    ["Conflitos internos", "INCONCLUSIVO automatico"],
  ];
  sheet.getRange("A3:B7").values = metadata;
  sheet.getRange("A3:A7").format = {
    fill: "#E2E8F0",
    font: { bold: true, color: "#0F172A" },
  };
  sheet.getRange("B3:B7").format.wrapText = true;

  const counts = payload.counts;
  const total = counts.total || 0;
  const summaryRows = [
    ["Status", "Quantidade", "Percentual"],
    ["BATEU", counts.bateu || 0, total ? ((counts.bateu || 0) / total) : 0],
    ["DIVERGIU", counts.divergiu || 0, total ? ((counts.divergiu || 0) / total) : 0],
    ["INCONCLUSIVO", counts.inconclusivo || 0, total ? ((counts.inconclusivo || 0) / total) : 0],
  ];
  sheet.getRange("D3:F6").values = summaryRows;
  applyHeaderStyle(sheet.getRange("D3:F3"));
  sheet.getRange("F4:F6").format.numberFormat = "0.0%";
  sheet.getRange("D4:F6").format.wrapText = true;

  const supportingRows = [
    ["Total de linhas", counts.total || 0],
    ["Comparacoes com cBenef", counts.cbenef_com_espera || 0],
    ["cBenef nao comparado", counts.cbenef_sem_comparacao || 0],
    ["Grupos em conflito", counts.grupos_em_conflito || 0],
  ];
  sheet.getRange("A10:B13").values = supportingRows;
  sheet.getRange("A10:A13").format = {
    fill: "#E2E8F0",
    font: { bold: true, color: "#0F172A" },
  };

  sheet.getRange("A15:H17").merge();
  sheet.getRange("A15").values = [[
    "A base foi comparada usando a mesma arvore de decisao do get-cbenef atual, com leitura direta das tabelas do Supabase via chave publica. " +
      "Itens com conflito interno da base foram marcados como INCONCLUSIVO automaticamente. " +
      "cBenef vazio na planilha foi tratado como nao comparar.",
  ]];
  sheet.getRange("A15:H17").format = {
    fill: "#F8FAFC",
    font: { italic: true, color: "#334155" },
    wrapText: true,
    verticalAlignment: "top",
  };

  sheet.getRange("A3:F13").format.rowHeightPx = 24;
  sheet.getRange("A15:H17").format.rowHeightPx = 60;
  sheet.getRange("A1:A17").format.columnWidthPx = 240;
  sheet.getRange("B1:B17").format.columnWidthPx = 360;
  sheet.getRange("D1:D17").format.columnWidthPx = 140;
  sheet.getRange("E1:E17").format.columnWidthPx = 140;
  sheet.getRange("F1:F17").format.columnWidthPx = 140;

  return sheet;
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
    throw new Error("Usage: node build_cbenef_validation_workbook.mjs --input-json <file> --output-xlsx <file>");
  }

  const artifactTool = await import(getRuntimeArtifactToolUrl());
  const { Workbook, SpreadsheetFile } = artifactTool;

  const payload = JSON.parse(await fs.readFile(inputJson, "utf-8"));
  const workbook = Workbook.create();

  addSummarySheet(workbook, payload);

  const columns = payload.columns;
  const rows = payload.rows;
  const byStatus = {
    BATEU: rows.filter((row) => row.status_validacao === "BATEU"),
    DIVERGIU: rows.filter((row) => row.status_validacao === "DIVERGIU"),
    INCONCLUSIVO: rows.filter((row) => row.status_validacao === "INCONCLUSIVO"),
  };

  const widths = [
    110, // Código
    240, // Descrição
    120, // NCM_esperado
    120, // NCM_retornado
    100, // CST_esperado
    100, // CST_retornado
    100, // %ICMS_esperado
    100, // %ICMS_retornado
    100, // TRIB_esperado
    120, // TRIB_retornado
    100, // CFOP_esperado
    120, // CFOP_retornado
    120, // cBenef_esperado
    120, // cBenef_retornado
    140, // status_validacao
    420, // motivo_divergencia
    110, // CEST
    150, // Dep.Nome
    150, // Tipo produto
  ];

  addDataSheet(workbook, "Validacao", columns, rows, widths);
  addDataSheet(workbook, "BATEU", columns, byStatus.BATEU, widths);
  addDataSheet(workbook, "DIVERGIU", columns, byStatus.DIVERGIU, widths);
  addDataSheet(workbook, "INCONCLUSIVO", columns, byStatus.INCONCLUSIVO, widths);

  await fs.mkdir(path.dirname(outputXlsx), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputXlsx);
}

await main();
