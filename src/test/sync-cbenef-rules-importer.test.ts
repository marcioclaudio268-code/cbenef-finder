import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ImportValidationError,
  csvRowsToRules,
  parseCsv,
  prepareImport,
} from "../../supabase/functions/sync-cbenef-rules/importer.ts";

function createMinimalRule(overrides: Record<string, unknown> = {}) {
  return {
    ncm: "12.34.56.78",
    cbenef_code: "sp000001",
    ...overrides,
  };
}

function captureValidationError(action: () => unknown) {
  try {
    action();
    throw new Error("Expected ImportValidationError");
  } catch (error) {
    expect(error).toBeInstanceOf(ImportValidationError);
    return error as ImportValidationError;
  }
}

describe("sync-cbenef-rules importer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes manual_json payloads with defaults and legacy aliases", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T15:30:45.000Z"));

    const prepared = prepareImport(
      "manual-json",
      [
        createMinimalRule({
          cst_icms: "20",
          suggested_cst_icms: "40",
          output_cst_icms: "60",
          output_cfop: "5.405",
          output_icms_rate: "12,5",
          output_st_applicable: "sim",
          output_trib_code: "trib",
          legal_url: "https://example.com/legal",
          legal_basis_name: "Lei estadual",
          keywords: "acucar; doce; acucar",
          keyword_include: ["premium", "premium", "refinado"],
          keyword_exclude: "teste|rascunho",
          description_patterns: "foo|bar",
          is_active: "1",
        }),
      ],
      {},
      "imported",
    );

    expect(prepared.version.versionLabel).toBe("v2026-04-12");
    expect(prepared.version.versionCode).toBe("manual-json-v2026-04-12");
    expect(prepared.version.publishedAt).toBe("2026-04-12T15:30:45.000Z");
    expect(prepared.rules).toHaveLength(1);
    expect(prepared.activeRuleIds).toEqual([prepared.rules[0].id]);
    expect(prepared.rules[0].finalIsActive).toBe(true);
    expect(prepared.rules[0].row).toMatchObject({
      cbenef_code: "SP000001",
      ncm: "12345678",
      cst_icms: "020",
      suggested_cst_icms: "040",
      output_cst_icms: "060",
      output_cfop: "5405",
      output_icms_rate: 12.5,
      output_st_applicable: true,
      output_trib_code: "TRIB",
      application_context: "Operacao interna - Estado de Sao Paulo",
      legal_basis: "Lei estadual",
      legal_basis_name: "Lei estadual",
      legal_basis_url: "https://example.com/legal",
      legal_url: "https://example.com/legal",
      priority: 10,
      keywords: ["acucar", "doce"],
      keyword_include: ["premium", "refinado"],
      keyword_exclude: ["teste", "rascunho"],
      description_patterns: ["foo", "bar"],
      rule_origin: "imported",
      validation_status: "draft",
      operation_destination_type: "consumer_final",
      tax_regime_scope: "rpa_cst",
      st_scope: "any",
      is_active: false,
      state: "SP",
      data_origin: "imported",
    });
  });

  it("parses manual_csv rows with quoted commas and escaped quotes", () => {
    const csv = [
      "ncm,cbenef_code,description,keywords,legal_url,validation_status,rule_origin,operation_destination_type,tax_regime_scope,st_scope,is_active",
      '"12.34.56.78","sp000002","Produto ""premium"", sabor, intenso","acucar; doce","https://example.com/csv","validated","manual_validated","contribuinte","simples_csosn","inside_st","true"',
    ].join("\n");

    const rows = parseCsv(csv);
    expect(rows).toEqual([
      {
        ncm: "12.34.56.78",
        cbenef_code: "sp000002",
        description: 'Produto "premium", sabor, intenso',
        keywords: "acucar; doce",
        legal_url: "https://example.com/csv",
        validation_status: "validated",
        rule_origin: "manual_validated",
        operation_destination_type: "contribuinte",
        tax_regime_scope: "simples_csosn",
        st_scope: "inside_st",
        is_active: "true",
      },
    ]);

    const prepared = prepareImport("manual-csv", csvRowsToRules(rows), {}, "imported");

    expect(prepared.rules[0].row).toMatchObject({
      ncm: "12345678",
      cbenef_code: "SP000002",
      description: 'Produto "premium", sabor, intenso',
      keywords: ["acucar", "doce"],
      legal_basis_url: "https://example.com/csv",
      legal_url: "https://example.com/csv",
      validation_status: "validated",
      rule_origin: "manual_validated",
      operation_destination_type: "contribuinte",
      tax_regime_scope: "simples_csosn",
      st_scope: "inside_st",
    });
  });

  it("keeps compatibility with legacy aliases coming from CSV rows", () => {
    const rules = csvRowsToRules([
      {
        ncm: "12.34.56.78",
        cbenef_code: "sp000003",
        legal_url: "https://example.com/legacy",
        keywords: "linha 1;linha 2",
        is_active: "1",
      },
    ]);

    const prepared = prepareImport("legacy-csv", rules, {}, "imported");

    expect(prepared.rules[0].row).toMatchObject({
      ncm: "12345678",
      legal_basis_url: "https://example.com/legacy",
      legal_url: "https://example.com/legacy",
      keywords: ["linha 1", "linha 2"],
    });
  });

  it("rejects invalid governed enums", () => {
    const error = captureValidationError(() =>
      prepareImport(
        "invalid-enums",
        [
          createMinimalRule({
            validation_status: "approved",
            rule_origin: "external",
            tax_regime_scope: "lucro_real",
          }),
        ],
        {},
        "imported",
      ),
    );

    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "validation_status" }),
        expect.objectContaining({ field: "rule_origin" }),
        expect.objectContaining({ field: "tax_regime_scope" }),
      ]),
    );
  });

  it("rejects invalid date ranges and requires status_reason for invalid rules", () => {
    const error = captureValidationError(() =>
      prepareImport(
        "invalid-dates",
        [
          createMinimalRule({
            validation_status: "invalid",
            valid_from: "2026-05-10",
            valid_to: "2026-05-01",
          }),
        ],
        {},
        "imported",
      ),
    );

    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "status_reason",
          message: "obrigatorio quando validation_status for invalid",
        }),
        expect.objectContaining({
          field: "valid_to",
          message: "nao pode ser anterior a valid_from",
        }),
      ]),
    );
  });

  it("rejects invalid NCM, CST and CFOP fields", () => {
    const error = captureValidationError(() =>
      prepareImport(
        "invalid-tax-fields",
        [
          createMinimalRule({
            ncm: "123",
            cst_icms: "1",
            output_cfop: "123",
          }),
        ],
        {},
        "imported",
      ),
    );

    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "ncm_code", message: "deve ter 2, 4, 6 ou 8 digitos" }),
        expect.objectContaining({ field: "cst_icms", message: "deve ter 2 ou 3 digitos" }),
        expect.objectContaining({ field: "output_cfop", message: "deve ter 4 digitos" }),
      ]),
    );
  });

  it("rejects imports without any active rule", () => {
    const error = captureValidationError(() =>
      prepareImport(
        "inactive-only",
        [
          createMinimalRule({
            is_active: false,
          }),
        ],
        {},
        "imported",
      ),
    );

    expect(error.issues).toContainEqual(
      expect.objectContaining({
        field: "rules",
        message: "a carga precisa conter pelo menos uma regra ativa",
      }),
    );
  });
});
