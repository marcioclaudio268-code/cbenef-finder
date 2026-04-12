/*
 * Import contract for sync-cbenef-rules
 *
 * Accepted payload fields now cover:
 * - output fields: output_cfop, output_cst_icms, output_icms_rate,
 *   output_st_applicable, output_trib_code
 * - semantic fields: product_family, product_type, presentation_type,
 *   macro_group, subgroup
 * - decision support: keywords, keyword_include, keyword_exclude,
 *   description_patterns, decision_reason
 * - governance fields when provided: rule_origin, validation_status,
 *   status_reason, validated_by, validated_at, valid_from, valid_to,
 *   rule_confidence, operation_destination_type, tax_regime_scope,
 *   st_scope, restriction_notes, replaced_by_rule_id
 *
 * The importer keeps backward compatibility with legacy keys such as
 * ncm, ncm_code, legal_url and keywords.
 */

export const DEFAULT_APPLICATION_CONTEXT = "Operacao interna - Estado de Sao Paulo";
export const DEFAULT_PRIORITY = 10;
export const DEFAULT_STATE = "SP";

const RULE_ORIGINS = ["imported", "manual_validated", "legacy_invalid", "office_operational"] as const;
const VALIDATION_STATUSES = ["draft", "validated", "invalid"] as const;
const RULE_CONFIDENCES = ["imported_low", "office_validated", "legal_confirmed"] as const;
const OPERATION_DESTINATION_TYPES = ["consumer_final", "contribuinte", "any"] as const;
const TAX_REGIME_SCOPES = ["rpa_cst", "simples_csosn", "any"] as const;
const ST_SCOPES = ["inside_st", "outside_st", "any"] as const;

export type DataOrigin = "seed" | "imported";
export type SourceType = "remote_json" | "manual_json" | "manual_csv";

export interface ImportVersionMetadata {
  version_label?: unknown;
  version_code?: unknown;
  published_at?: unknown;
}

export interface ImportPayload extends ImportVersionMetadata {
  source_type?: unknown;
  source_name?: unknown;
  rules?: unknown;
  csv?: unknown;
}

export interface ImportRule {
  id?: unknown;
  ncm_code?: unknown;
  ncm?: unknown;
  cbenef_code?: unknown;
  cst_icms?: unknown;
  suggested_cst_icms?: unknown;
  description?: unknown;
  application_context?: unknown;
  legal_basis?: unknown;
  legal_basis_name?: unknown;
  legal_basis_summary?: unknown;
  legal_basis_url?: unknown;
  legal_url?: unknown;
  priority?: unknown;
  keywords?: unknown;
  keyword_include?: unknown;
  keyword_exclude?: unknown;
  description_patterns?: unknown;
  is_active?: unknown;
  output_cfop?: unknown;
  output_cst_icms?: unknown;
  output_icms_rate?: unknown;
  output_st_applicable?: unknown;
  output_trib_code?: unknown;
  product_family?: unknown;
  product_type?: unknown;
  presentation_type?: unknown;
  macro_group?: unknown;
  subgroup?: unknown;
  decision_reason?: unknown;
  rule_origin?: unknown;
  validation_status?: unknown;
  status_reason?: unknown;
  validated_by?: unknown;
  validated_at?: unknown;
  valid_from?: unknown;
  valid_to?: unknown;
  rule_confidence?: unknown;
  operation_destination_type?: unknown;
  tax_regime_scope?: unknown;
  st_scope?: unknown;
  restriction_notes?: unknown;
  replaced_by_rule_id?: unknown;
  state?: unknown;
}

export interface ValidationIssue {
  index: number;
  field: string;
  message: string;
}

export interface PreparedRule {
  id: string;
  row: Record<string, unknown>;
  finalIsActive: boolean;
}

export interface PreparedImport {
  rules: PreparedRule[];
  activeRuleIds: string[];
  version: {
    id: string;
    versionLabel: string;
    versionCode: string;
    publishedAt: string;
  };
}

export class ImportValidationError extends Error {
  readonly issues: ValidationIssue[];
  readonly status: number;

  constructor(message: string, issues: ValidationIssue[], status = 400) {
    super(message);
    this.name = "ImportValidationError";
    this.issues = issues;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: ValidationIssue[], index: number, field: string, message: string) {
  issues.push({ index, field, message });
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

export function readOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function readRequiredString(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) {
    addIssue(issues, index, field, "campo obrigatorio ausente ou vazio");
    return null;
  }

  return normalized;
}

function normalizeOptionalStringArray(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string[] | null {
  if (value === undefined || value === null || value === "") return null;

  let entries: unknown[];
  if (Array.isArray(value)) {
    entries = value;
  } else if (typeof value === "string") {
    entries = value.split(/[;\n|]/g);
  } else {
    addIssue(issues, index, field, "deve ser array de strings ou texto separado por ';'");
    return null;
  }

  const normalized = entries
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));

  return normalized.length > 0 ? dedupeStrings(normalized) : null;
}

function normalizeOptionalBoolean(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "nao"].includes(normalized)) return false;
  }

  addIssue(issues, index, field, "deve ser booleano");
  return null;
}

function normalizeOptionalInteger(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): number | null {
  if (value === undefined || value === null || value === "") return null;

  const normalized = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(normalized)) {
    addIssue(issues, index, field, "deve ser numero inteiro");
    return null;
  }

  return normalized;
}

function normalizeOptionalRate(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): number | null {
  if (value === undefined || value === null || value === "") return null;

  let normalized: number;
  if (typeof value === "number") {
    normalized = value;
  } else if (typeof value === "string") {
    normalized = Number(value.trim().replace(",", "."));
  } else {
    addIssue(issues, index, field, "deve ser numero");
    return null;
  }

  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
    addIssue(issues, index, field, "deve estar entre 0 e 100");
    return null;
  }

  return normalized;
}

function normalizeOptionalUrl(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;

  try {
    return new URL(normalized).toString();
  } catch {
    addIssue(issues, index, field, "deve ser URL absoluta valida");
    return null;
  }
}

function normalizeOptionalDate(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    addIssue(issues, index, field, "deve estar no formato YYYY-MM-DD");
    return null;
  }

  const timestamp = Date.parse(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) {
    addIssue(issues, index, field, "data invalida");
    return null;
  }

  return normalized;
}

function normalizeOptionalDateTime(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;

  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    addIssue(issues, index, field, "deve ser data/hora ISO valida");
    return null;
  }

  return new Date(timestamp).toISOString();
}

function normalizeOptionalUuid(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(normalized)) {
    addIssue(issues, index, field, "deve ser UUID valido");
    return null;
  }

  return normalized;
}

function normalizeOptionalEnum<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  issues: ValidationIssue[],
  index: number,
  field: string,
): T[number] | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;

  if (!allowedValues.includes(normalized as T[number])) {
    addIssue(issues, index, field, `valor invalido. Use um de: ${allowedValues.join(", ")}`);
    return null;
  }

  return normalized as T[number];
}

function normalizeNcm(rule: ImportRule, issues: ValidationIssue[], index: number): string | null {
  const rawNcmCode = readOptionalString(rule.ncm_code);
  const rawNcm = readOptionalString(rule.ncm);

  if (rawNcmCode && rawNcm) {
    const digitsA = rawNcmCode.replace(/\D/g, "");
    const digitsB = rawNcm.replace(/\D/g, "");
    if (digitsA !== digitsB) {
      addIssue(issues, index, "ncm", "ncm_code e ncm divergem");
      return null;
    }
  }

  const baseValue = readRequiredString(rule.ncm_code ?? rule.ncm, issues, index, "ncm_code");
  if (!baseValue) return null;

  const normalized = baseValue.replace(/\D/g, "");
  if (![2, 4, 6, 8].includes(normalized.length)) {
    addIssue(issues, index, "ncm_code", "deve ter 2, 4, 6 ou 8 digitos");
    return null;
  }

  return normalized;
}

function normalizeCst(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;

  const digits = normalized.replace(/\D/g, "");
  if (![2, 3].includes(digits.length)) {
    addIssue(issues, index, field, "deve ter 2 ou 3 digitos");
    return null;
  }

  return digits.padStart(3, "0");
}

function normalizeCfop(
  value: unknown,
  issues: ValidationIssue[],
  index: number,
  field: string,
): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;

  const digits = normalized.replace(/\D/g, "");
  if (digits.length !== 4) {
    addIssue(issues, index, field, "deve ter 4 digitos");
    return null;
  }

  return digits;
}

function normalizeVersionMetadata(
  feedName: string,
  metadata: ImportVersionMetadata,
  issues: ValidationIssue[],
): PreparedImport["version"] {
  const versionLabel = readOptionalString(metadata.version_label) ?? `v${new Date().toISOString().slice(0, 10)}`;
  const versionCode = readOptionalString(metadata.version_code) ?? `${feedName}-${versionLabel}`;
  const publishedAt =
    normalizeOptionalDateTime(metadata.published_at, issues, -1, "published_at") ?? new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    versionLabel,
    versionCode,
    publishedAt,
  };
}

function normalizeRule(
  rawRule: ImportRule,
  index: number,
  versionId: string,
  dataOrigin: DataOrigin,
  issues: ValidationIssue[],
): PreparedRule | null {
  if (!isRecord(rawRule)) {
    addIssue(issues, index, "rule", "cada item deve ser um objeto JSON");
    return null;
  }

  const ncm = normalizeNcm(rawRule, issues, index);
  const cbenefCodeRaw = readRequiredString(rawRule.cbenef_code, issues, index, "cbenef_code");
  const cbenefCode = cbenefCodeRaw?.toUpperCase() ?? null;
  const cstIcms = normalizeCst(rawRule.cst_icms, issues, index, "cst_icms");
  const suggestedCstIcms = normalizeCst(rawRule.suggested_cst_icms, issues, index, "suggested_cst_icms");
  const outputCstIcms = normalizeCst(rawRule.output_cst_icms, issues, index, "output_cst_icms");
  const outputCfop = normalizeCfop(rawRule.output_cfop, issues, index, "output_cfop");
  const outputIcmsRate = normalizeOptionalRate(rawRule.output_icms_rate, issues, index, "output_icms_rate");
  const outputStApplicable = normalizeOptionalBoolean(
    rawRule.output_st_applicable,
    issues,
    index,
    "output_st_applicable",
  );
  const outputTribCode = readOptionalString(rawRule.output_trib_code)?.toUpperCase() ?? null;

  const description = readOptionalString(rawRule.description);
  const applicationContext = readOptionalString(rawRule.application_context) ?? DEFAULT_APPLICATION_CONTEXT;
  const legalBasisName = readOptionalString(rawRule.legal_basis_name);
  const legalBasisSummary = readOptionalString(rawRule.legal_basis_summary);
  const legalBasis = readOptionalString(rawRule.legal_basis) ?? legalBasisName;
  const legalBasisUrl = normalizeOptionalUrl(
    rawRule.legal_basis_url ?? rawRule.legal_url,
    issues,
    index,
    "legal_basis_url",
  );
  const legalUrl = normalizeOptionalUrl(
    rawRule.legal_url ?? rawRule.legal_basis_url,
    issues,
    index,
    "legal_url",
  );

  const priority = normalizeOptionalInteger(rawRule.priority, issues, index, "priority") ?? DEFAULT_PRIORITY;
  const keywords = normalizeOptionalStringArray(rawRule.keywords, issues, index, "keywords");
  const keywordInclude = normalizeOptionalStringArray(rawRule.keyword_include, issues, index, "keyword_include");
  const keywordExclude = normalizeOptionalStringArray(rawRule.keyword_exclude, issues, index, "keyword_exclude");
  const descriptionPatterns = normalizeOptionalStringArray(
    rawRule.description_patterns,
    issues,
    index,
    "description_patterns",
  );

  const productFamily = readOptionalString(rawRule.product_family);
  const productType = readOptionalString(rawRule.product_type);
  const presentationType = readOptionalString(rawRule.presentation_type);
  const macroGroup = readOptionalString(rawRule.macro_group);
  const subgroup = readOptionalString(rawRule.subgroup);
  const decisionReason = readOptionalString(rawRule.decision_reason);

  const ruleOrigin =
    normalizeOptionalEnum(rawRule.rule_origin, RULE_ORIGINS, issues, index, "rule_origin") ?? "imported";
  const validationStatus =
    normalizeOptionalEnum(rawRule.validation_status, VALIDATION_STATUSES, issues, index, "validation_status") ??
    "draft";
  const statusReason = readOptionalString(rawRule.status_reason);
  const validatedBy = readOptionalString(rawRule.validated_by);
  const validatedAt = normalizeOptionalDateTime(rawRule.validated_at, issues, index, "validated_at");
  const validFrom = normalizeOptionalDate(rawRule.valid_from, issues, index, "valid_from");
  const validTo = normalizeOptionalDate(rawRule.valid_to, issues, index, "valid_to");
  const ruleConfidence = normalizeOptionalEnum(
    rawRule.rule_confidence,
    RULE_CONFIDENCES,
    issues,
    index,
    "rule_confidence",
  );
  const operationDestinationType =
    normalizeOptionalEnum(
      rawRule.operation_destination_type,
      OPERATION_DESTINATION_TYPES,
      issues,
      index,
      "operation_destination_type",
    ) ?? "consumer_final";
  const taxRegimeScope =
    normalizeOptionalEnum(rawRule.tax_regime_scope, TAX_REGIME_SCOPES, issues, index, "tax_regime_scope") ??
    "rpa_cst";
  const stScope = normalizeOptionalEnum(rawRule.st_scope, ST_SCOPES, issues, index, "st_scope") ?? "any";
  const restrictionNotes = readOptionalString(rawRule.restriction_notes);
  const replacedByRuleId = normalizeOptionalUuid(
    rawRule.replaced_by_rule_id,
    issues,
    index,
    "replaced_by_rule_id",
  );

  const finalIsActive = normalizeOptionalBoolean(rawRule.is_active, issues, index, "is_active") ?? true;
  const state = (readOptionalString(rawRule.state) ?? DEFAULT_STATE).toUpperCase();

  if (state !== DEFAULT_STATE) {
    addIssue(issues, index, "state", "apenas regras do estado SP sao suportadas nesta carga");
  }

  if (validationStatus === "invalid" && !statusReason) {
    addIssue(issues, index, "status_reason", "obrigatorio quando validation_status for invalid");
  }

  if (validFrom && validTo && validTo < validFrom) {
    addIssue(issues, index, "valid_to", "nao pode ser anterior a valid_from");
  }

  if (!ncm || !cbenefCode) return null;

  const id = normalizeOptionalUuid(rawRule.id, issues, index, "id") ?? crypto.randomUUID();

  return {
    id,
    finalIsActive,
    row: {
      id,
      rule_version_id: versionId,
      cbenef_code: cbenefCode,
      ncm,
      cst_icms: cstIcms,
      suggested_cst_icms: suggestedCstIcms,
      description,
      application_context: applicationContext,
      legal_basis: legalBasis,
      legal_basis_name: legalBasisName,
      legal_basis_summary: legalBasisSummary,
      legal_basis_url: legalBasisUrl,
      legal_url: legalUrl,
      priority,
      keywords,
      keyword_include: keywordInclude,
      keyword_exclude: keywordExclude,
      description_patterns: descriptionPatterns,
      product_family: productFamily,
      product_type: productType,
      presentation_type: presentationType,
      macro_group: macroGroup,
      subgroup,
      output_cfop: outputCfop,
      output_cst_icms: outputCstIcms,
      output_icms_rate: outputIcmsRate,
      output_st_applicable: outputStApplicable,
      output_trib_code: outputTribCode,
      decision_reason: decisionReason,
      rule_origin: ruleOrigin,
      validation_status: validationStatus,
      status_reason: statusReason,
      validated_by: validatedBy,
      validated_at: validatedAt,
      valid_from: validFrom,
      valid_to: validTo,
      rule_confidence: ruleConfidence,
      operation_destination_type: operationDestinationType,
      tax_regime_scope: taxRegimeScope,
      st_scope: stScope,
      restriction_notes: restrictionNotes,
      replaced_by_rule_id: replacedByRuleId,
      is_active: false,
      state,
      data_origin: dataOrigin,
    },
  };
}

export function prepareImport(
  feedName: string,
  rawRules: unknown[],
  versionMetadata: ImportVersionMetadata,
  dataOrigin: DataOrigin,
): PreparedImport {
  const issues: ValidationIssue[] = [];
  const version = normalizeVersionMetadata(feedName, versionMetadata, issues);
  const preparedRules = rawRules
    .map((rule, index) => normalizeRule(rule as ImportRule, index, version.id, dataOrigin, issues))
    .filter((rule): rule is PreparedRule => Boolean(rule));

  if (preparedRules.length === 0) {
    addIssue(issues, -1, "rules", "nenhuma regra valida foi encontrada");
  }

  const activeRuleIds = preparedRules.filter((rule) => rule.finalIsActive).map((rule) => rule.id);
  if (activeRuleIds.length === 0) {
    addIssue(issues, -1, "rules", "a carga precisa conter pelo menos uma regra ativa");
  }

  if (issues.length > 0) {
    throw new ImportValidationError("Payload de importacao invalido.", issues);
  }

  return { rules: preparedRules, activeRuleIds, version };
}

export function parseCsv(csv: string): Record<string, string>[] {
  const normalizedCsv = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalizedCsv) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let i = 0; i < normalizedCsv.length; i += 1) {
    const char = normalizedCsv[i];
    const nextChar = normalizedCsv[i + 1];

    if (char === "\"") {
      if (insideQuotes && nextChar === "\"") {
        currentValue += "\"";
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (char === "\n" && !insideQuotes) {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  rows.push(currentRow);

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().replace(/^"|"$/g, ""));

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        record[header] = (row[idx] ?? "").trim();
      });
      return record;
    });
}

export function csvRowsToRules(rows: Record<string, string>[]): ImportRule[] {
  return rows.map((row) => ({
    id: row.id || undefined,
    ncm_code: row.ncm_code || row.ncm || undefined,
    ncm: row.ncm || row.ncm_code || undefined,
    cbenef_code: row.cbenef_code || undefined,
    cst_icms: row.cst_icms || undefined,
    suggested_cst_icms: row.suggested_cst_icms || undefined,
    description: row.description || undefined,
    application_context: row.application_context || undefined,
    legal_basis: row.legal_basis || undefined,
    legal_basis_name: row.legal_basis_name || undefined,
    legal_basis_summary: row.legal_basis_summary || undefined,
    legal_basis_url: row.legal_basis_url || undefined,
    legal_url: row.legal_url || undefined,
    priority: row.priority || undefined,
    keywords: row.keywords || undefined,
    keyword_include: row.keyword_include || undefined,
    keyword_exclude: row.keyword_exclude || undefined,
    description_patterns: row.description_patterns || undefined,
    product_family: row.product_family || undefined,
    product_type: row.product_type || undefined,
    presentation_type: row.presentation_type || undefined,
    macro_group: row.macro_group || undefined,
    subgroup: row.subgroup || undefined,
    output_cfop: row.output_cfop || undefined,
    output_cst_icms: row.output_cst_icms || undefined,
    output_icms_rate: row.output_icms_rate || undefined,
    output_st_applicable: row.output_st_applicable || undefined,
    output_trib_code: row.output_trib_code || undefined,
    decision_reason: row.decision_reason || undefined,
    rule_origin: row.rule_origin || undefined,
    validation_status: row.validation_status || undefined,
    status_reason: row.status_reason || undefined,
    validated_by: row.validated_by || undefined,
    validated_at: row.validated_at || undefined,
    valid_from: row.valid_from || undefined,
    valid_to: row.valid_to || undefined,
    rule_confidence: row.rule_confidence || undefined,
    operation_destination_type: row.operation_destination_type || undefined,
    tax_regime_scope: row.tax_regime_scope || undefined,
    st_scope: row.st_scope || undefined,
    restriction_notes: row.restriction_notes || undefined,
    replaced_by_rule_id: row.replaced_by_rule_id || undefined,
    is_active: row.is_active || undefined,
    state: row.state || undefined,
  }));
}

export function extractImportDataFromJson(
  rawData: unknown,
): { rules: unknown[]; versionMetadata: ImportVersionMetadata } {
  if (Array.isArray(rawData)) {
    return { rules: rawData, versionMetadata: {} };
  }

  if (isRecord(rawData)) {
    const rules = Array.isArray(rawData.rules)
      ? rawData.rules
      : Array.isArray(rawData.data)
        ? rawData.data
        : null;

    if (rules) {
      return {
        rules,
        versionMetadata: {
          version_label: rawData.version_label,
          version_code: rawData.version_code,
          published_at: rawData.published_at,
        },
      };
    }
  }

  throw new ImportValidationError(
    "Formato JSON nao reconhecido. Use array, { rules: [] } ou { data: [] }.",
    [],
  );
}
