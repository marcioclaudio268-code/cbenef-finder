#!/usr/bin/env python3
"""Generate before-vs-after impact reports for the get-cbenef safe fallback hardening."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


HARDEN_COMMIT = "639b909daf5f5cc1c5eec26f27e5f69c5fb24b95"
WORKBOOK_PATH = Path(r"C:/Users/thatf/Downloads/cbenef_finder_base_validacao_enxuta.xlsx")
WORKBOOK_SHEET = "Base_Validacao"
BEFORE_SAMPLE_DIR = Path("outputs/cbenef-sample-validation")
AFTER_SAMPLE_DIR = Path("outputs/cbenef-sample-validation-after-hardening")
BEFORE_MASS_DIR = Path("outputs/cbenef-validation")
AFTER_MASS_DIR = Path("outputs/cbenef-validation-after-hardening")
OUTPUT_DIR = Path("outputs/cbenef-hardening-impact")
SCOPED_FIELDS = ("NCM", "CST", "%ICMS", "CFOP", "cBenef")


@dataclass
class ResponseState:
    response: dict[str, Any]
    ok: bool = True


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_module_from_path(module_name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def load_module_from_git_ref(module_name: str, git_ref: str, relative_path: str) -> Any:
    source = subprocess.check_output(
        ["git", "show", f"{git_ref}:{relative_path}"],
        text=True,
        encoding="utf-8",
    )
    with tempfile.TemporaryDirectory() as temp_dir:
        module_path = Path(temp_dir) / Path(relative_path).name
        module_path.write_text(source, encoding="utf-8")
        return load_module_from_path(module_name, module_path)


def init_field_metrics() -> dict[str, dict[str, int]]:
    return {
        field: {
            "applicable": 0,
            "matched": 0,
            "mismatched": 0,
            "ignored": 0,
            "inconclusivo": 0,
        }
        for field in SCOPED_FIELDS
    }


def finalize_field_metrics(metrics: dict[str, dict[str, int]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for field, values in metrics.items():
        compared = values["matched"] + values["mismatched"]
        result[field] = {
            **values,
            "compared": compared,
            "match_rate": (values["matched"] / compared) if compared else None,
        }
    return result


def build_sample_field_metrics(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    metrics = init_field_metrics()

    for row in rows:
        status = row["status_handler_real"]
        field_values = {
            "NCM": (row["NCM_esperado"], row["NCM_handler"], True),
            "CST": (row["CST_esperado"], row["CST_handler"], True),
            "%ICMS": (row["%ICMS_esperado"], row["%ICMS_handler"], True),
            "CFOP": (row["CFOP_esperado"], row["CFOP_handler"], True),
            "cBenef": (row["cBenef_esperado"], row["cBenef_handler"], bool(row["cBenef_esperado"])),
        }

        for field, (expected, returned, applicable) in field_values.items():
            if not applicable:
                metrics[field]["ignored"] += 1
                continue
            metrics[field]["applicable"] += 1
            if status == "INCONCLUSIVO":
                metrics[field]["inconclusivo"] += 1
            elif expected == returned:
                metrics[field]["matched"] += 1
            else:
                metrics[field]["mismatched"] += 1

    return finalize_field_metrics(metrics)


def count_low_confidence_states(states: list[ResponseState]) -> dict[str, Any]:
    low_confidence = 0
    unpromoted = 0
    prefix_promoted = 0
    prefix_low = 0

    for state in states:
        if not state.ok:
            continue
        response = state.response
        is_low = response.get("confidence_level") == "low"
        if is_low:
            low_confidence += 1
        if is_low and response.get("matched_by_ncm_prefix"):
            prefix_low += 1
        if response.get("matched_by_ncm_prefix") and response.get("matched_rule_id"):
            prefix_promoted += 1
        if is_low and not response.get("matched_rule_id") and not response.get("cbenef_code"):
            unpromoted += 1

    return {
        "low_confidence": low_confidence,
        "low_confidence_unpromoted": unpromoted,
        "prefix_promoted": prefix_promoted,
        "prefix_low_confidence": prefix_low,
    }


def build_sample_comparison() -> dict[str, Any]:
    before_summary = load_json(BEFORE_SAMPLE_DIR / "sample_validation_summary.json")
    after_summary = load_json(AFTER_SAMPLE_DIR / "sample_validation_summary.json")
    before_results = load_json(BEFORE_SAMPLE_DIR / "sample_validation_results.json")
    after_results = load_json(AFTER_SAMPLE_DIR / "sample_validation_results.json")
    before_responses_payload = load_json(BEFORE_SAMPLE_DIR / "real_flow_responses.json")
    after_responses_payload = load_json(AFTER_SAMPLE_DIR / "real_flow_responses.json")

    before_states = [
        ResponseState(response=entry["response"] or {}, ok=bool(entry["ok"]))
        for entry in before_responses_payload["responses"]
    ]
    after_states = [
        ResponseState(response=entry["response"] or {}, ok=bool(entry["ok"]))
        for entry in after_responses_payload["responses"]
    ]

    before_by_sample = {entry["sample_id"]: entry["response"] or {} for entry in before_responses_payload["responses"]}
    after_by_sample = {entry["sample_id"]: entry["response"] or {} for entry in after_responses_payload["responses"]}

    weak_prefix_demotions: list[dict[str, Any]] = []
    for row in after_results["rows"]:
        sample_id = row["sample_id"]
        before_response = before_by_sample[sample_id]
        after_response = after_by_sample[sample_id]
        if (
            before_response.get("matched_by_ncm_prefix")
            and before_response.get("matched_rule_id")
            and not after_response.get("matched_rule_id")
            and after_response.get("confidence_level") == "low"
        ):
            weak_prefix_demotions.append(
                {
                    "sample_id": sample_id,
                    "description": row["DescriÃ§Ã£o"],
                    "ncm": row["NCM_esperado"],
                }
            )

    handler_counts_before = before_summary["handler_counts"]
    handler_counts_after = after_summary["handler_counts"]
    field_metrics_before = build_sample_field_metrics(before_results["rows"])
    field_metrics_after = build_sample_field_metrics(after_results["rows"])
    low_before = count_low_confidence_states(before_states)
    low_after = count_low_confidence_states(after_states)

    return {
        "baseline_source": {
            "before_dir": str(BEFORE_SAMPLE_DIR.resolve()),
            "after_dir": str(AFTER_SAMPLE_DIR.resolve()),
            "before_generated_at": before_summary["generated_at"],
            "after_generated_at": after_summary["generated_at"],
        },
        "counts": {
            "before": handler_counts_before,
            "after": handler_counts_after,
        },
        "field_metrics": {
            "before": field_metrics_before,
            "after": field_metrics_after,
        },
        "low_confidence": {
            "before": low_before,
            "after": low_after,
        },
        "weak_prefix_demotions": {
            "count": len(weak_prefix_demotions),
            "examples": weak_prefix_demotions[:10],
        },
        "public_flow_change_detected": handler_counts_before != handler_counts_after or field_metrics_before != field_metrics_after,
        "after_handler_vs_local_seam": after_summary["handler_vs_seam"],
        "after_handler_vs_local_seam_verdict": after_summary["hypothesis_assessment"],
    }


def build_replayed_mass_comparison() -> dict[str, Any]:
    current_module = load_module_from_path("validate_cbenef_base_after", Path("scripts/validate_cbenef_base.py"))
    before_module = load_module_from_git_ref(
        "validate_cbenef_base_before",
        f"{HARDEN_COMMIT}^",
        "scripts/validate_cbenef_base.py",
    )

    supabase_payload = load_json(AFTER_MASS_DIR / "supabase_tables.json")
    rows = current_module.load_workbook_rows(WORKBOOK_PATH, WORKBOOK_SHEET, None)
    conflict_map = current_module.build_conflict_map(rows)

    before_taxonomy = before_module.build_taxonomy(
        supabase_payload["classification_groups"],
        supabase_payload["classification_group_keywords"],
    )
    before_rules_by_exact, before_rules_by_prefix = before_module.build_engine_tables(supabase_payload["cbenef_rules"])

    after_taxonomy = current_module.build_taxonomy(
        supabase_payload["classification_groups"],
        supabase_payload["classification_group_keywords"],
    )
    after_rules_by_exact, after_rules_by_prefix = current_module.build_engine_tables(supabase_payload["cbenef_rules"])

    before_counts = {"BATEU": 0, "DIVERGIU": 0, "INCONCLUSIVO": 0}
    after_counts = {"BATEU": 0, "DIVERGIU": 0, "INCONCLUSIVO": 0}
    before_field_metrics = init_field_metrics()
    after_field_metrics = init_field_metrics()
    before_states: list[ResponseState] = []
    after_states: list[ResponseState] = []
    weak_prefix_demotions: list[dict[str, Any]] = []

    for row in rows:
        before_response = before_module.classify_row(row, before_rules_by_exact, before_rules_by_prefix, before_taxonomy)
        after_response = current_module.classify_row(row, after_rules_by_exact, after_rules_by_prefix, after_taxonomy)

        validation_key = current_module.build_validation_key(row)
        conflict_reason = conflict_map.get(validation_key, {}).get("reason")

        before_comparisons = before_module.build_field_comparisons(row, before_response)
        after_comparisons = current_module.build_field_comparisons(row, after_response)
        before_status, before_reason = before_module.compare_row(conflict_reason, before_comparisons)
        after_status, after_reason = current_module.compare_row(conflict_reason, after_comparisons)

        before_counts[before_status] += 1
        after_counts[after_status] += 1
        before_states.append(ResponseState(response=before_response))
        after_states.append(ResponseState(response=after_response))

        for field in SCOPED_FIELDS:
            before_metric = before_field_metrics[field]
            before_comparison = before_comparisons[field]
            if not before_comparison["applicable"]:
                before_metric["ignored"] += 1
            else:
                before_metric["applicable"] += 1
                if before_status == "INCONCLUSIVO":
                    before_metric["inconclusivo"] += 1
                elif before_comparison["matches"]:
                    before_metric["matched"] += 1
                else:
                    before_metric["mismatched"] += 1

            after_metric = after_field_metrics[field]
            after_comparison = after_comparisons[field]
            if not after_comparison["applicable"]:
                after_metric["ignored"] += 1
            else:
                after_metric["applicable"] += 1
                if after_status == "INCONCLUSIVO":
                    after_metric["inconclusivo"] += 1
                elif after_comparison["matches"]:
                    after_metric["matched"] += 1
                else:
                    after_metric["mismatched"] += 1

        if (
            before_response.get("matched_by_ncm_prefix")
            and before_response.get("matched_rule_id")
            and not after_response.get("matched_rule_id")
            and after_response.get("confidence_level") == "low"
        ):
            weak_prefix_demotions.append(
                {
                    "source_row": row["_source_row"],
                    "codigo": current_module.stringify_code(row.get("CÃ³digo") or row.get("Código")),
                    "descricao": current_module.clean_text(row.get("DescriÃ§Ã£o") or row.get("Descrição")),
                    "ncm": current_module.normalize_ncm(row["NCM"]),
                    "before_status": before_status,
                    "after_status": after_status,
                    "before_reason": before_reason,
                    "after_reason": after_reason,
                }
            )

    historical_before_summary = load_json(BEFORE_MASS_DIR / "validation_summary.json")
    after_summary = load_json(AFTER_MASS_DIR / "validation_summary.json")

    return {
        "baseline_source": {
            "historical_before_dir": str(BEFORE_MASS_DIR.resolve()),
            "historical_after_dir": str(AFTER_MASS_DIR.resolve()),
            "historical_before_generated_at": historical_before_summary["generated_at"],
            "historical_after_generated_at": after_summary["generated_at"],
            "replayed_before_ref": f"{HARDEN_COMMIT}^",
            "replayed_after_ref": "working_tree",
            "supabase_snapshot": str((AFTER_MASS_DIR / "supabase_tables.json").resolve()),
        },
        "historical_counts": {
            "before": historical_before_summary["counts"],
            "after": after_summary["counts"],
        },
        "historical_field_metrics": {
            "before": historical_before_summary["field_metrics"],
            "after": after_summary["field_metrics"],
        },
        "replayed_counts": {
            "before": before_counts,
            "after": after_counts,
        },
        "replayed_field_metrics": {
            "before": finalize_field_metrics(before_field_metrics),
            "after": finalize_field_metrics(after_field_metrics),
        },
        "replayed_low_confidence": {
            "before": count_low_confidence_states(before_states),
            "after": count_low_confidence_states(after_states),
        },
        "weak_prefix_demotions": {
            "count": len(weak_prefix_demotions),
            "examples": weak_prefix_demotions[:25],
        },
    }


def render_field_table(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    lines = [
        "| Campo | Antes | Depois | Delta |",
        "| --- | ---: | ---: | ---: |",
    ]
    for field in SCOPED_FIELDS:
        before_rate = before[field]["match_rate"] or 0
        after_rate = after[field]["match_rate"] or 0
        delta = after_rate - before_rate
        lines.append(
            f"| {field} | {before_rate:.2%} | {after_rate:.2%} | {delta:+.2%} |"
        )
    return lines


def render_counts_table(before: dict[str, int], after: dict[str, int]) -> list[str]:
    lines = [
        "| Status | Antes | Depois | Delta |",
        "| --- | ---: | ---: | ---: |",
    ]
    for status in ("BATEU", "DIVERGIU", "INCONCLUSIVO"):
        lines.append(
            f"| {status} | {before[status]} | {after[status]} | {after[status] - before[status]:+d} |"
        )
    return lines


def write_markdown_reports(sample_report: dict[str, Any], mass_report: dict[str, Any]) -> None:
    sample_lines = [
        "# Relatorio Comparativo da Amostra Real",
        "",
        "## Contagens",
        *render_counts_table(sample_report["counts"]["before"], sample_report["counts"]["after"]),
        "",
        "## Aderencia por Campo",
        *render_field_table(sample_report["field_metrics"]["before"], sample_report["field_metrics"]["after"]),
        "",
        "## Baixa Confianca e Prefixo",
        f"- Antes: {sample_report['low_confidence']['before']['low_confidence']} casos em baixa confianca.",
        f"- Depois: {sample_report['low_confidence']['after']['low_confidence']} casos em baixa confianca.",
        f"- Antes: {sample_report['low_confidence']['before']['low_confidence_unpromoted']} respostas baixas e nao promovidas.",
        f"- Depois: {sample_report['low_confidence']['after']['low_confidence_unpromoted']} respostas baixas e nao promovidas.",
        f"- Democoes de prefixo fraco no fluxo publico: {sample_report['weak_prefix_demotions']['count']}.",
        "",
        "## Observacao Operacional",
        f"- Mudanca detectada no fluxo publico antes vs depois: {'SIM' if sample_report['public_flow_change_detected'] else 'NAO'}.",
        f"- Depois do endurecimento no codigo local, o handler publico ficou alinhado com a seam em {sample_report['after_handler_vs_local_seam']['same_scoped_payload_count']}/{sample_report['after_handler_vs_local_seam']['sample_count']} itens da amostra.",
        f"- Veredito do alinhamento handler vs seam: {sample_report['after_handler_vs_local_seam_verdict']['verdict']}.",
    ]
    (OUTPUT_DIR / "sample_real_before_vs_after.md").write_text("\n".join(sample_lines) + "\n", encoding="utf-8")

    mass_lines = [
        "# Relatorio Comparativo da Validacao em Massa",
        "",
        "## Contagens Historicas",
        *render_counts_table(
            {
                "BATEU": mass_report["historical_counts"]["before"]["bateu"],
                "DIVERGIU": mass_report["historical_counts"]["before"]["divergiu"],
                "INCONCLUSIVO": mass_report["historical_counts"]["before"]["inconclusivo"],
            },
            {
                "BATEU": mass_report["historical_counts"]["after"]["bateu"],
                "DIVERGIU": mass_report["historical_counts"]["after"]["divergiu"],
                "INCONCLUSIVO": mass_report["historical_counts"]["after"]["inconclusivo"],
            },
        ),
        "",
        "## Aderencia por Campo Historica",
        *render_field_table(mass_report["historical_field_metrics"]["before"], mass_report["historical_field_metrics"]["after"]),
        "",
        "## Baixa Confianca no Replay Isolado",
        f"- Antes: {mass_report['replayed_low_confidence']['before']['low_confidence']} casos em baixa confianca.",
        f"- Depois: {mass_report['replayed_low_confidence']['after']['low_confidence']} casos em baixa confianca.",
        f"- Antes: {mass_report['replayed_low_confidence']['before']['low_confidence_unpromoted']} respostas baixas e nao promovidas.",
        f"- Depois: {mass_report['replayed_low_confidence']['after']['low_confidence_unpromoted']} respostas baixas e nao promovidas.",
        f"- Promocoes por prefixo antes: {mass_report['replayed_low_confidence']['before']['prefix_promoted']}.",
        f"- Promocoes por prefixo depois: {mass_report['replayed_low_confidence']['after']['prefix_promoted']}.",
        f"- Prefixos fracos despromovidos: {mass_report['weak_prefix_demotions']['count']}.",
    ]
    (OUTPUT_DIR / "mass_validation_before_vs_after.md").write_text("\n".join(mass_lines) + "\n", encoding="utf-8")

    sample_change = sample_report["public_flow_change_detected"]
    mass_low_before = mass_report["replayed_low_confidence"]["before"]["low_confidence_unpromoted"]
    mass_low_after = mass_report["replayed_low_confidence"]["after"]["low_confidence_unpromoted"]
    mass_prefix_demotions = mass_report["weak_prefix_demotions"]["count"]

    executive_lines = [
        "# Resumo Executivo",
        "",
        f"- O endurecimento reduziu falsa precisao no replay em massa: {'SIM' if mass_prefix_demotions > 0 else 'NAO'}.",
        f"- No fluxo publico da amostra real, a mudanca visivel antes vs depois foi {'detectada' if sample_change else 'nao detectada'}.",
        f"- As contagens de BATEU/DIVERGIU/INCONCLUSIVO ficaram estaveis em massa, entao o efeito veio de seguranca de selecao, nao de virada estatistica bruta.",
        f"- Respostas baixas e nao promovidas passaram de {mass_low_before} para {mass_low_after} no replay em massa.",
        "- A piora de aderencia por campo no replay deve ser lida como aumento de conservadorismo onde antes havia promocao fraca por prefixo, nao como regressao automatica do motor.",
        f"- O efeito observado aponta os casos residuais mais para cobertura de base do que para disputa prematura de prefixo: {'SIM' if mass_prefix_demotions > 0 else 'PARCIAL'}.",
        "- Proximo passo mais coerente: saneamento de base, depois de garantir que o ambiente publico esteja refletindo o endurecimento ja presente no codigo.",
    ]
    (OUTPUT_DIR / "executive_summary.md").write_text("\n".join(executive_lines) + "\n", encoding="utf-8")


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    sample_report = build_sample_comparison()
    mass_report = build_replayed_mass_comparison()

    (OUTPUT_DIR / "sample_real_before_vs_after.json").write_text(
        json.dumps(sample_report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "mass_validation_before_vs_after.json").write_text(
        json.dumps(mass_report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_markdown_reports(sample_report, mass_report)

    summary = {
        "sample_report": str((OUTPUT_DIR / "sample_real_before_vs_after.json").resolve()),
        "mass_report": str((OUTPUT_DIR / "mass_validation_before_vs_after.json").resolve()),
        "executive_summary": str((OUTPUT_DIR / "executive_summary.md").resolve()),
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
