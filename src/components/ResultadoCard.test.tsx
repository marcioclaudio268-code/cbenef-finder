import { render, screen } from "@testing-library/react";

import { ResultadoCard } from "./ResultadoCard";
import type { CbenefResult } from "@/types/cbenef";

const resultFixture: CbenefResult = {
  cbenef_code: "SP123456",
  informed_cst_icms: "020",
  suggested_cst_icms: "060",
  final_cst_icms: "060",
  cst_source: "sugerido",
  cst_warning: "",
  confidence_score: 0.92,
  confidence_level: "high",
  matched_rule_id: "rule-1",
  application_context: "Operação interna - Estado de São Paulo",
  legal_basis_name: "Portaria CAT",
  legal_basis_summary: "Resumo legal",
  legal_basis_url: "https://example.com/legal",
  rule_version: {
    version_label: "v2026-04-12",
    version_code: "base-ativa-2026-04",
    published_at: "2026-04-12T00:00:00.000Z",
  },
  last_updated_at: "2026-04-12T00:00:00.000Z",
  input_ncm: "12345678",
  matched_ncm: "12345678",
  explanation: "Regra selecionada com alta confiança.",
  matched_by_ncm_exact: true,
  matched_by_ncm_prefix: false,
  keyword_match_count: 2,
  used_informed_cst: false,
  auto_suggested_cst: true,
  data_origin: "imported",
  normalized_description: "queijo mussarela fatiado",
  matched_keywords: ["queijo", "mussarela"],
  excluded_keywords_hit: [],
  inferred_macro_group: "queijos",
  inferred_subgroup: "mussarela",
  informed_group: "",
  group_consistency_status: "inferido",
  product_family: "queijos",
  product_type: "mussarela",
  presentation_type: "fatiada",
  output_st_applicable: false,
  output_icms_rate: 12,
  output_cfop: "5405",
  output_trib_code: "TRIB123",
  decision_reason: "Compatibilidade de NCM e descrição.",
};

describe("ResultadoCard", () => {
  it("renders TRIB only once in the central outputs and keeps contextual details separate", () => {
    render(<ResultadoCard result={resultFixture} />);

    expect(screen.getAllByText("TRIB")).toHaveLength(1);
    expect(screen.getAllByText("TRIB123")).toHaveLength(1);
    expect(screen.getAllByText("CFOP")).toHaveLength(1);
    expect(screen.queryByText("Tributação sugerida")).not.toBeInTheDocument();
    expect(screen.queryByText("CST Final")).not.toBeInTheDocument();
    expect(screen.getByText("Contexto complementar")).toBeInTheDocument();
    expect(screen.getByText("ST Aplicável")).toBeInTheDocument();
    expect(screen.getByText("NCM Considerado")).toBeInTheDocument();
    expect(screen.getByText(/Versão:/)).toHaveTextContent("base-ativa-2026-04");
  });
});
