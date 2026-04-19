#!/usr/bin/env python3
"""Validate a stratified sample against the real public get-cbenef flow and the local seam."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


DEFAULT_INPUT = Path(r"C:/Users/thatf/Downloads/cbenef_finder_base_validacao_enxuta.xlsx")
DEFAULT_OUTPUT_DIR = Path("outputs/cbenef-sample-validation")
DEFAULT_SHEET = "Base_Validacao"
DEFAULT_REAL_FLOW_HELPER = Path("scripts/invoke_get_cbenef_real_flow.mjs")
DEFAULT_SUPABASE_FETCHER = Path("scripts/fetch_cbenef_supabase.mjs")
DEFAULT_BUILDER = Path("scripts/build_cbenef_sample_workbook.mjs")

OUTPUT_COLUMNS = [
    "sample_id",
    "ordem_amostra",
    "_source_row",
    "familia_amostra",
    "criterio_amostra",
    "Código",
    "Descrição",
    "Dep.Nome",
    "Tipo produto",
    "NCM_esperado",
    "NCM_handler",
    "NCM_seam",
    "CST_esperado",
    "CST_handler",
    "CST_seam",
    "%ICMS_esperado",
    "%ICMS_handler",
    "%ICMS_seam",
    "CFOP_esperado",
    "CFOP_handler",
    "CFOP_seam",
    "cBenef_esperado",
    "cBenef_handler",
    "cBenef_seam",
    "TRIB_handler",
    "TRIB_seam",
    "status_handler_real",
    "status_seam_local",
    "handler_vs_seam",
    "campos_divergentes_handler",
    "campos_diferentes_handler_vs_seam",
    "motivo_handler_real",
    "motivo_seam_local",
    "real_flow_ok",
    "real_flow_error",
]

SelectorPredicate = Callable[[dict[str, Any]], bool]


SELECTORS: list[dict[str, Any]] = [
    {
        "sample_id": "C01",
        "family": "carnes",
        "label": "Carnes com cBenef preenchido e CST 020 / CFOP 5102",
        "predicate": lambda row: row["_family"] == "carnes" and row["_has_cbenef"] and row["_cst"] == "020" and row["_cfop"] == "5102",
    },
    {
        "sample_id": "C02",
        "family": "carnes",
        "label": "Carnes sem cBenef, CST 060 e CFOP 5405",
        "predicate": lambda row: row["_family"] == "carnes" and not row["_has_cbenef"] and row["_cst"] == "060" and row["_cfop"] == "5405",
    },
    {
        "sample_id": "C03",
        "family": "carnes",
        "label": "Carnes com cBenef, CST 060 e CFOP 5405",
        "predicate": lambda row: row["_family"] == "carnes" and row["_has_cbenef"] and row["_cst"] == "060" and row["_cfop"] == "5405",
    },
    {
        "sample_id": "L01",
        "family": "laticinios",
        "label": "Laticínios sem cBenef, CST 060 e CFOP 5405",
        "predicate": lambda row: row["_family"] == "laticinios" and not row["_has_cbenef"] and row["_cst"] == "060" and row["_cfop"] == "5405",
    },
    {
        "sample_id": "L02",
        "family": "laticinios",
        "label": "Laticínios sem cBenef e CFOP 5405 fora do CST 060",
        "predicate": lambda row: row["_family"] == "laticinios" and not row["_has_cbenef"] and row["_cfop"] == "5405" and row["_cst"] != "060",
    },
    {
        "sample_id": "L03",
        "family": "laticinios",
        "label": "Laticínios com cBenef preenchido",
        "predicate": lambda row: row["_family"] == "laticinios" and row["_has_cbenef"],
    },
    {
        "sample_id": "M01",
        "family": "mercearia",
        "label": "Mercearia sem cBenef, CST 060 e CFOP 5405",
        "predicate": lambda row: row["_family"] == "mercearia" and not row["_has_cbenef"] and row["_cst"] == "060" and row["_cfop"] == "5405",
    },
    {
        "sample_id": "M02",
        "family": "mercearia",
        "label": "Mercearia em conflito interno da base (CFOP 5405)",
        "predicate": lambda row: row["_family"] == "mercearia" and row["_description_key"] == "UVA SEM SEMENTE FINAS DE MESA 500G",
    },
    {
        "sample_id": "M03",
        "family": "mercearia",
        "label": "Mercearia com cBenef preenchido e CFOP 5405",
        "predicate": lambda row: row["_family"] == "mercearia" and row["_has_cbenef"] and row["_cfop"] == "5405",
    },
    {
        "sample_id": "H01",
        "family": "hortifruti",
        "label": "Hortifruti com cBenef preenchido e CST 040",
        "predicate": lambda row: row["_family"] == "hortifruti" and row["_has_cbenef"] and row["_cst"] == "040",
    },
    {
        "sample_id": "H02",
        "family": "hortifruti",
        "label": "Hortifruti com cBenef preenchido fora do CST 040",
        "predicate": lambda row: row["_family"] == "hortifruti" and row["_has_cbenef"] and row["_cst"] != "040",
    },
    {
        "sample_id": "H03",
        "family": "hortifruti",
        "label": "Hortifruti sem cBenef preenchido",
        "predicate": lambda row: row["_family"] == "hortifruti" and not row["_has_cbenef"],
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a stratified cbenef-finder sample against the public get-cbenef flow.",
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Path to the consolidated workbook.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Directory for output artifacts.")
    parser.add_argument("--sheet", default=DEFAULT_SHEET, help="Worksheet name with the consolidated base.")
    parser.add_argument(
        "--real-flow-helper",
        type=Path,
        default=DEFAULT_REAL_FLOW_HELPER,
        help="Node helper that invokes the public get-cbenef flow.",
    )
    parser.add_argument(
        "--supabase-fetcher",
        type=Path,
        default=DEFAULT_SUPABASE_FETCHER,
        help="Node helper that fetches Supabase tables for the seam local.",
    )
    parser.add_argument(
        "--builder",
        type=Path,
        default=DEFAULT_BUILDER,
        help="Node workbook builder for the sample report.",
    )
    return parser.parse_args()


def load_validation_module() -> Any:
    module_path = Path("scripts/validate_cbenef_base.py").resolve()
    spec = importlib.util.spec_from_file_location("validate_cbenef_base", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load validation module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def normalize_dep_to_family(dep_name: str, seam: Any) -> str:
    normalized = seam.normalize_description_key(dep_name).lower()
    if normalized == "laticinios":
        return "laticinios"
    if normalized == "acougue":
        return "carnes"
    if normalized == "flv":
        return "hortifruti"
    if normalized in {"basico", "mercearia manutencao", "complemento doce", "complemento salgado"}:
        return "mercearia"
    return "outros"


def enrich_rows(rows: list[dict[str, Any]], seam: Any) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for row in rows:
        cloned = dict(row)
        cloned["_description_key"] = seam.normalize_description_key(row["Descrição"])
        cloned["_family"] = normalize_dep_to_family(seam.clean_text(row["Dep.Nome"]), seam)
        cloned["_ncm"] = seam.normalize_ncm(row["NCM"])
        cloned["_cst"] = seam.normalize_cst(row["CST_ICMS<S>"])
        cloned["_cfop"] = seam.normalize_cfop(row["CFOP"])
        cloned["_has_cbenef"] = bool(seam.normalize_cbenef(row["cBenef"]))
        enriched.append(cloned)
    return enriched


def select_sample(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    used_rows: set[int] = set()

    for order, selector in enumerate(SELECTORS, start=1):
        match = next(
            (
                row
                for row in rows
                if row["_source_row"] not in used_rows and selector["predicate"](row)
            ),
            None,
        )
        if match is None:
            raise RuntimeError(f"No row matched selector {selector['sample_id']}: {selector['label']}")

        used_rows.add(match["_source_row"])
        sampled = dict(match)
        sampled["sample_id"] = selector["sample_id"]
        sampled["ordem_amostra"] = order
        sampled["familia_amostra"] = selector["family"]
        sampled["criterio_amostra"] = selector["label"]
        selected.append(sampled)

    return selected


def build_requests(sample_rows: list[dict[str, Any]], seam: Any) -> list[dict[str, Any]]:
    requests = []
    for row in sample_rows:
        requests.append(
            {
                "sample_id": row["sample_id"],
                "source_row": row["_source_row"],
                "descricao": seam.normalize_description_request(row["Descrição"]),
                "ncm": seam.normalize_ncm(row["NCM"]),
            }
        )
    return requests


def invoke_real_flow(requests_path: Path, output_path: Path, helper: Path) -> dict[str, Any]:
    subprocess.run(
        [
            "node",
            str(helper.resolve()),
            "--input-json",
            str(requests_path),
            "--output-json",
            str(output_path),
        ],
        check=True,
    )
    return json.loads(output_path.read_text(encoding="utf-8"))


def load_seam_engine(output_dir: Path, fetcher: Path, seam: Any) -> dict[str, Any]:
    supabase_cache = output_dir / "supabase_tables.json"
    subprocess.run(
        [
            "node",
            str(fetcher.resolve()),
            "--output-json",
            str(supabase_cache),
        ],
        check=True,
    )
    payload = json.loads(supabase_cache.read_text(encoding="utf-8"))
    taxonomy = seam.build_taxonomy(payload["classification_groups"], payload["classification_group_keywords"])
    rules_by_exact, rules_by_prefix = seam.build_engine_tables(payload["cbenef_rules"])
    return {
        "taxonomy": taxonomy,
        "rules_by_exact": rules_by_exact,
        "rules_by_prefix": rules_by_prefix,
    }


def compare_payloads(
    row: dict[str, Any],
    handler_response: dict[str, Any] | None,
    seam_response: dict[str, Any],
    seam: Any,
) -> tuple[str, list[str]]:
    handler = seam.build_field_comparisons(row, handler_response or {})
    local = seam.build_field_comparisons(row, seam_response)
    differences: list[str] = []

    for field_name in ("NCM", "CST", "%ICMS", "CFOP", "cBenef"):
        handler_field = handler[field_name]
        seam_field = local[field_name]
        if not handler_field["applicable"] and not seam_field["applicable"]:
            continue
        if handler_field["expected"] == seam_field["expected"] and handler_field["returned"] == seam_field["returned"]:
            continue
        differences.append(field_name)

    return ("ALINHADO" if not differences else "DIFERENTE"), differences


def classify_result(
    row: dict[str, Any],
    response: dict[str, Any] | None,
    conflict_reason: str | None,
    seam: Any,
) -> tuple[str, str, dict[str, dict[str, Any]], list[str]]:
    field_comparisons = seam.build_field_comparisons(row, response or {})
    status, reason = seam.compare_row(conflict_reason, field_comparisons)
    diverging_fields = [
        field_name
        for field_name in ("NCM", "CST", "%ICMS", "CFOP", "cBenef")
        if field_comparisons[field_name]["applicable"] and not field_comparisons[field_name]["matches"]
    ]
    return status, reason, field_comparisons, diverging_fields


def handler_response_lookup(real_flow_payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["sample_id"]: entry for entry in real_flow_payload["responses"]}


def counts_to_dict(counter: Counter[str]) -> dict[str, int]:
    return {
        "BATEU": counter.get("BATEU", 0),
        "DIVERGIU": counter.get("DIVERGIU", 0),
        "INCONCLUSIVO": counter.get("INCONCLUSIVO", 0),
    }


def build_hypothesis_assessment(handler_vs_seam: dict[str, Any]) -> dict[str, str]:
    different = handler_vs_seam["different_items_count"]
    total = handler_vs_seam["sample_count"]
    if different == 0:
        return {
            "verdict": "Enfraquece a hipótese de distorção pela seam local",
            "reasoning": (
                "Na amostra, handler real e seam local devolveram a mesma classificação e a mesma saída "
                "nos campos do escopo em todos os itens selecionados. Isso sugere que a divergência observada "
                "antes não veio de um espelho local desalinhado nesta camada."
            ),
        }
    if different <= max(1, total // 6):
        return {
            "verdict": "Enfraquece parcialmente a hipótese de distorção pela seam local",
            "reasoning": (
                "A maior parte da amostra ficou alinhada entre handler real e seam local. Existem diferenças pontuais, "
                "mas o padrão dominante não indica que a seam esteja distorcendo materialmente a leitura do fluxo real."
            ),
        }
    return {
        "verdict": "Reforça a hipótese de distorção pela seam local",
        "reasoning": (
            "A amostra mostrou divergências recorrentes entre o retorno do handler público e a seam local nos campos do escopo. "
            "Antes de tratar base ou regras em massa, vale investigar esse desvio de execução."
        ),
    }


def write_csv(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    seam = load_validation_module()
    base_rows = seam.load_workbook_rows(args.input, args.sheet, None)
    enriched_rows = enrich_rows(base_rows, seam)
    sample_rows = select_sample(enriched_rows)

    conflict_map = seam.build_conflict_map(base_rows)
    seam_engine = load_seam_engine(args.output_dir, args.supabase_fetcher, seam)

    requests = build_requests(sample_rows, seam)
    requests_path = args.output_dir / "sample_requests.json"
    requests_path.write_text(json.dumps(requests, ensure_ascii=False, indent=2), encoding="utf-8")

    real_flow_json = args.output_dir / "real_flow_responses.json"
    real_flow_payload = invoke_real_flow(requests_path, real_flow_json, args.real_flow_helper)
    real_lookup = handler_response_lookup(real_flow_payload)

    result_rows: list[dict[str, Any]] = []
    handler_counts: Counter[str] = Counter()
    seam_counts: Counter[str] = Counter()
    handler_field_divergences: Counter[str] = Counter()
    handler_vs_seam_field_differences: Counter[str] = Counter()
    same_status_count = 0
    same_scoped_payload_count = 0
    different_items_count = 0

    for row in sample_rows:
        seam_response = seam.classify_row(
            row,
            seam_engine["rules_by_exact"],
            seam_engine["rules_by_prefix"],
            seam_engine["taxonomy"],
        )
        real_result = real_lookup[row["sample_id"]]
        handler_response = real_result["response"] if real_result["ok"] else {}
        conflict_reason = conflict_map.get(seam.build_validation_key(row), {}).get("reason")

        handler_status, handler_reason, _, handler_diverging_fields = classify_result(
            row,
            handler_response,
            conflict_reason if real_result["ok"] else (conflict_reason or f"Falha ao consultar handler real: {real_result['error']['message']}"),
            seam,
        )
        seam_status, seam_reason, _, _ = classify_result(
            row,
            seam_response,
            conflict_reason,
            seam,
        )

        alignment_status, alignment_fields = compare_payloads(row, handler_response, seam_response, seam)

        if handler_status == seam_status:
            same_status_count += 1
        if alignment_status == "ALINHADO":
            same_scoped_payload_count += 1
        else:
            different_items_count += 1
            for field in alignment_fields:
                handler_vs_seam_field_differences[field] += 1

        for field in handler_diverging_fields:
            handler_field_divergences[field] += 1

        handler_counts[handler_status] += 1
        seam_counts[seam_status] += 1

        result_rows.append(
            {
                "sample_id": row["sample_id"],
                "ordem_amostra": row["ordem_amostra"],
                "_source_row": row["_source_row"],
                "familia_amostra": row["familia_amostra"],
                "criterio_amostra": row["criterio_amostra"],
                "Código": seam.stringify_code(row["Código"]),
                "Descrição": seam.clean_text(row["Descrição"]),
                "Dep.Nome": seam.clean_text(row["Dep.Nome"]),
                "Tipo produto": seam.clean_text(row["Tipo produto"]),
                "NCM_esperado": seam.normalize_ncm(row["NCM"]),
                "NCM_handler": seam.normalize_ncm(handler_response.get("matched_ncm")),
                "NCM_seam": seam.normalize_ncm(seam_response.get("matched_ncm")),
                "CST_esperado": seam.normalize_cst(row["CST_ICMS<S>"]),
                "CST_handler": seam.normalize_cst(handler_response.get("final_cst_icms")),
                "CST_seam": seam.normalize_cst(seam_response.get("final_cst_icms")),
                "%ICMS_esperado": seam.normalize_percent(row["% ICMS<S>"]),
                "%ICMS_handler": seam.normalize_percent(handler_response.get("output_icms_rate")),
                "%ICMS_seam": seam.normalize_percent(seam_response.get("output_icms_rate")),
                "CFOP_esperado": seam.normalize_cfop(row["CFOP"]),
                "CFOP_handler": seam.normalize_cfop(handler_response.get("output_cfop")),
                "CFOP_seam": seam.normalize_cfop(seam_response.get("output_cfop")),
                "cBenef_esperado": seam.normalize_cbenef(row["cBenef"]),
                "cBenef_handler": seam.normalize_cbenef(handler_response.get("cbenef_code")),
                "cBenef_seam": seam.normalize_cbenef(seam_response.get("cbenef_code")),
                "TRIB_handler": seam.normalize_trib(handler_response.get("output_trib_code")),
                "TRIB_seam": seam.normalize_trib(seam_response.get("output_trib_code")),
                "status_handler_real": handler_status,
                "status_seam_local": seam_status,
                "handler_vs_seam": alignment_status,
                "campos_divergentes_handler": ", ".join(handler_diverging_fields),
                "campos_diferentes_handler_vs_seam": ", ".join(alignment_fields),
                "motivo_handler_real": handler_reason,
                "motivo_seam_local": seam_reason,
                "real_flow_ok": "SIM" if real_result["ok"] else "NAO",
                "real_flow_error": "" if real_result["ok"] else real_result["error"]["message"],
            }
        )

    sample_counts = Counter(row["familia_amostra"] for row in sample_rows)
    sample_cbenef = Counter("com_cbenef" if row["_has_cbenef"] else "sem_cbenef" for row in sample_rows)
    sample_cst = Counter(row["_cst"] for row in sample_rows)
    sample_cfop = Counter(row["_cfop"] for row in sample_rows)

    handler_vs_seam = {
        "sample_count": len(sample_rows),
        "same_status_count": same_status_count,
        "same_scoped_payload_count": same_scoped_payload_count,
        "different_items_count": different_items_count,
        "field_differences": {field: handler_vs_seam_field_differences.get(field, 0) for field in ("NCM", "CST", "%ICMS", "CFOP", "cBenef")},
    }

    hypothesis = build_hypothesis_assessment(handler_vs_seam)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(args.input.resolve()),
        "source_sheet": args.sheet,
        "sample_definition": {
            "sample_size": len(sample_rows),
            "summary": (
                "12 itens, 3 por família visível (carnes, laticínios, mercearia e hortifruti), "
                "com cobertura explícita de cBenef preenchido/vazio, CFOP 5405, CST 040 e CST 060."
            ),
            "family_counts": dict(sample_counts),
            "cbenef_counts": dict(sample_cbenef),
            "cst_counts": dict(sample_cst),
            "cfop_counts": dict(sample_cfop),
            "selectors": [
                {
                    "sample_id": row["sample_id"],
                    "source_row": row["_source_row"],
                    "family": row["familia_amostra"],
                    "criterion": row["criterio_amostra"],
                    "description": seam.clean_text(row["Descrição"]),
                    "ncm": seam.normalize_ncm(row["NCM"]),
                }
                for row in sample_rows
            ],
        },
        "real_flow": {
            "description": (
                "Fluxo público via supabase-js, usando supabase.functions.invoke('get-cbenef') "
                "com a mesma edge function publicada e o mesmo formato de body da tela, "
                "limitado a descricao + ncm."
            ),
            "helper": str(args.real_flow_helper.resolve()),
            "request_fields": ["descricao", "ncm"],
            "responses_file": str(real_flow_json.resolve()),
        },
        "handler_counts": counts_to_dict(handler_counts),
        "seam_counts": counts_to_dict(seam_counts),
        "handler_field_divergences": {field: handler_field_divergences.get(field, 0) for field in ("NCM", "CST", "%ICMS", "CFOP", "cBenef")},
        "handler_vs_seam": handler_vs_seam,
        "hypothesis_assessment": hypothesis,
        "columns": OUTPUT_COLUMNS,
        "rows": result_rows,
    }

    summary_json = args.output_dir / "sample_validation_summary.json"
    detail_json = args.output_dir / "sample_validation_results.json"
    csv_path = args.output_dir / "sample_validation_results.csv"
    workbook_path = args.output_dir / "cbenef_sample_validation_report.xlsx"

    summary_json.write_text(
        json.dumps(
            {
                "generated_at": payload["generated_at"],
                "sample_definition": payload["sample_definition"],
                "real_flow": payload["real_flow"],
                "handler_counts": payload["handler_counts"],
                "seam_counts": payload["seam_counts"],
                "handler_field_divergences": payload["handler_field_divergences"],
                "handler_vs_seam": payload["handler_vs_seam"],
                "hypothesis_assessment": payload["hypothesis_assessment"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    detail_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(csv_path, OUTPUT_COLUMNS, result_rows)

    subprocess.run(
        [
            "node",
            str(args.builder.resolve()),
            "--input-json",
            str(detail_json),
            "--output-xlsx",
            str(workbook_path),
        ],
        check=True,
    )

    print(json.dumps(payload["handler_counts"], ensure_ascii=False))
    print(str(workbook_path.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
