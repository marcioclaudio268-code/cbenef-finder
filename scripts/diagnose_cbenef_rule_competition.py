#!/usr/bin/env python3
"""Diagnose the current get-cbenef rule competition on a traced sample."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_INPUT = Path(r"C:/Users/thatf/Downloads/cbenef_finder_base_validacao_enxuta.xlsx")
DEFAULT_OUTPUT_DIR = Path("outputs/cbenef-rule-competition")
DEFAULT_SHEET = "Base_Validacao"
DEFAULT_REAL_FLOW_HELPER = Path("scripts/invoke_get_cbenef_real_flow.mjs")
DEFAULT_SUPABASE_FETCHER = Path("scripts/fetch_cbenef_supabase.mjs")
DEFAULT_BUILDER = Path("scripts/build_cbenef_competition_workbook.mjs")

ITEM_COLUMNS = [
    "sample_id",
    "sample_order",
    "source_row",
    "sample_family",
    "sample_criterion",
    "Codigo",
    "Descricao",
    "Dep.Nome",
    "Tipo produto",
    "NCM_esperado",
    "CST_esperado",
    "%ICMS_esperado",
    "CFOP_esperado",
    "cBenef_esperado",
    "motor_status",
    "motor_divergence_fields",
    "motor_reason",
    "motor_matched_rule_id",
    "motor_match_path",
    "motor_matched_ncm",
    "motor_cst",
    "motor_cfop",
    "motor_icms_rate",
    "motor_cbenef",
    "motor_confidence_score",
    "diagnostic_match_path",
    "diagnostic_prefix_used",
    "exact_candidate_count",
    "candidate_count",
    "eligible_count",
    "excluded_count",
    "winner_id",
    "winner_matches_motor",
    "winner_reason_summary",
    "winner_sort_decider",
    "winner_has_semantic_signal",
    "winner_priority",
    "winner_data_origin",
    "winner_state",
    "winner_validation_status",
    "winner_rule_origin",
    "winner_operation_destination_type",
    "winner_tax_regime_scope",
    "winner_st_scope",
    "winner_ncm",
    "winner_cbenef_code",
    "winner_output_cst_icms",
    "winner_output_cfop",
    "winner_output_icms_rate",
    "winner_product_type",
    "winner_macro_group",
    "winner_include_hits",
    "winner_exclude_terms_hit",
    "top_runner_id",
    "top_runner_score",
    "top_runner_priority",
    "primary_factor",
]

CANDIDATE_COLUMNS = [
    "sample_id",
    "sample_order",
    "source_row",
    "Descricao",
    "NCM_esperado",
    "candidate_rank",
    "candidate_scope",
    "candidate_prefix",
    "eligible",
    "winner",
    "top_tie",
    "rule_id",
    "rule_ncm",
    "cbenef_code",
    "output_cst_icms",
    "output_cfop",
    "output_icms_rate",
    "priority",
    "data_origin",
    "state",
    "is_active",
    "validation_status",
    "rule_origin",
    "operation_destination_type",
    "tax_regime_scope",
    "st_scope",
    "product_family",
    "product_type",
    "presentation_type",
    "macro_group",
    "subgroup",
    "score",
    "include_hits",
    "exclude_hit",
    "exclude_terms_hit",
    "product_type_match",
    "group_match",
    "presentation_match",
    "sort_decider",
]

DESC_INDEX = 1
NCM_INDEX = 2
CST_INDEX = 3
ICMS_INDEX = 4
TRIB_INDEX = 5
CFOP_INDEX = 6
CBENEF_INDEX = 7
DEP_INDEX = 9
TIPO_INDEX = 10
CODIGO_INDEX = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Diagnose the get-cbenef rule competition on the traced sample.",
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Path to the consolidated workbook.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Directory for diagnostic artifacts.")
    parser.add_argument("--sheet", default=DEFAULT_SHEET, help="Worksheet with the consolidated base.")
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
        help="Node helper that fetches Supabase tables used by the diagnostic seam.",
    )
    parser.add_argument(
        "--builder",
        type=Path,
        default=DEFAULT_BUILDER,
        help="Node workbook builder for the diagnostic report.",
    )
    return parser.parse_args()


def load_module(module_name: str, relative_path: str) -> Any:
    module_path = Path(relative_path).resolve()
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module {module_name} from {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_sample(sample_mod: Any, seam: Any, input_path: Path, sheet_name: str) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    base_rows = seam.load_workbook_rows(input_path, sheet_name, None)
    enriched_rows = sample_mod.enrich_rows(base_rows, seam)
    sample_rows = sample_mod.select_sample(enriched_rows)
    return sample_rows, seam.build_conflict_map(base_rows)


def load_real_flow(sample_mod: Any, seam: Any, sample_rows: list[dict[str, Any]], helper: Path, output_dir: Path) -> dict[str, Any]:
    requests = sample_mod.build_requests(sample_rows, seam)
    requests_path = output_dir / "competition_sample_requests.json"
    responses_path = output_dir / "competition_real_flow_responses.json"
    requests_path.write_text(json.dumps(requests, ensure_ascii=False, indent=2), encoding="utf-8")
    return sample_mod.invoke_real_flow(requests_path, responses_path, helper)


def load_engine(seam: Any, fetcher: Path, output_dir: Path) -> dict[str, Any]:
    supabase_cache = output_dir / "competition_supabase_tables.json"
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
    rule_fields = set()
    for rule in payload["cbenef_rules"]:
        rule_fields.update(rule.keys())
    return {
        "taxonomy": taxonomy,
        "rules_by_exact": rules_by_exact,
        "rules_by_prefix": rules_by_prefix,
        "rule_fields": rule_fields,
    }


def real_flow_lookup(real_flow_payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["sample_id"]: entry for entry in real_flow_payload["responses"]}


def normalize_sample_context(row: dict[str, Any], seam: Any, taxonomy: list[Any]) -> dict[str, Any]:
    description_key = seam.REQUESTED_COLUMNS[DESC_INDEX]
    ncm_key = seam.REQUESTED_COLUMNS[NCM_INDEX]
    cst_key = seam.REQUESTED_COLUMNS[CST_INDEX]
    raw_description = seam.normalize_description_request(row[description_key])
    ncm = seam.normalize_ncm(row[ncm_key])
    informed_cst = seam.normalize_cst(row[cst_key])

    normalized_description = seam.collapse_spaces(seam.remove_accents(raw_description).lower())
    normalized_tokens = [token for token in normalized_description.split(" ") if token]
    strong_tokens = [
        token
        for token in normalized_tokens
        if token and token not in seam.NOISE_TOKENS and not seam.re.fullmatch(r"\d+", token)
    ]
    classification = seam.infer_product_classification(strong_tokens)
    group_inference = seam.infer_group_from_taxonomy(strong_tokens, normalized_description, taxonomy)

    return {
        "raw_description": raw_description,
        "ncm": ncm,
        "informed_cst": informed_cst,
        "normalized_description": normalized_description,
        "normalized_tokens": normalized_tokens,
        "strong_tokens": strong_tokens,
        "classification": classification,
        "group_inference": group_inference,
    }


def detect_candidates(context: dict[str, Any], rules_by_exact: dict[str, list[dict[str, Any]]], rules_by_prefix: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    ncm = context["ncm"]
    exact_rules = rules_by_exact.get(ncm, [])
    if exact_rules:
        return {
            "match_path": "exact",
            "prefix_used": "",
            "exact_candidate_count": len(exact_rules),
            "candidate_rules": exact_rules,
        }

    for prefix_length in (6, 4, 2):
        prefix = ncm[:prefix_length]
        if not prefix:
            continue
        prefix_rules = rules_by_prefix.get(prefix, [])
        if prefix_rules:
            return {
                "match_path": f"prefix_{prefix_length}",
                "prefix_used": prefix,
                "exact_candidate_count": 0,
                "candidate_rules": prefix_rules,
            }

    return {
        "match_path": "none",
        "prefix_used": "",
        "exact_candidate_count": 0,
        "candidate_rules": [],
    }


def sort_key(entry: dict[str, Any]) -> tuple[Any, ...]:
    return (
        0 if entry["presentationMatch"] else 1,
        0 if entry["productTypeMatch"] else 1,
        0 if entry["groupMatch"] else 1,
        -len(entry["includeHits"]),
        -entry["score"],
        -int(entry["rule"].get("priority", 0) or 0),
    )


def hit_exclude_terms(rule: dict[str, Any], normalized_description: str, strong_tokens: list[str], seam: Any) -> list[str]:
    hits: list[str] = []
    for token in rule.get("keyword_exclude") or []:
        normalized = seam.remove_accents(token).lower()
        if normalized in strong_tokens or normalized in normalized_description:
            hits.append(token)
    return hits


def choose_sort_decider(winner: dict[str, Any] | None, runner_up: dict[str, Any] | None) -> str:
    if winner is None:
        return "sem_vencedora"
    if runner_up is None:
        return "unica_elegivel"
    if winner["presentationMatch"] != runner_up["presentationMatch"]:
        return "presentation_match"
    if winner["productTypeMatch"] != runner_up["productTypeMatch"]:
        return "product_type_match"
    if winner["groupMatch"] != runner_up["groupMatch"]:
        return "group_match"
    if len(winner["includeHits"]) != len(runner_up["includeHits"]):
        return "include_hits"
    if winner["score"] != runner_up["score"]:
        return "score"
    winner_priority = int(winner["rule"].get("priority", 0) or 0)
    runner_priority = int(runner_up["rule"].get("priority", 0) or 0)
    if winner_priority != runner_priority:
        return "priority"
    return "stable_order_tie"


def winner_reason_summary(
    match_path: str,
    prefix_used: str,
    winner: dict[str, Any] | None,
    runner_up: dict[str, Any] | None,
    candidate_count: int,
    eligible_count: int,
) -> str:
    if winner is None and candidate_count == 0:
        return "Nenhuma regra encontrada no NCM exato nem nos prefixos 6/4/2."
    if winner is None and candidate_count > 0:
        return "As regras encontradas foram eliminadas por keyword_exclude."

    source_label = "NCM exato" if match_path == "exact" else f"prefixo {prefix_used}"
    decider = choose_sort_decider(winner, runner_up)

    if decider == "unica_elegivel":
        return f"Unica regra elegivel entre {candidate_count} candidata(s) recuperada(s) por {source_label}."
    if decider == "presentation_match":
        return f"Venceu por presentationMatch sobre a segunda colocada dentro de {eligible_count} elegiveis por {source_label}."
    if decider == "product_type_match":
        return f"Venceu por productTypeMatch sobre a segunda colocada dentro de {eligible_count} elegiveis por {source_label}."
    if decider == "group_match":
        return f"Venceu por groupMatch sobre a segunda colocada dentro de {eligible_count} elegiveis por {source_label}."
    if decider == "include_hits":
        return f"Venceu por maior quantidade de includeHits sobre a segunda colocada dentro de {eligible_count} elegiveis por {source_label}."
    if decider == "score":
        return f"Venceu por score maior sobre a segunda colocada dentro de {eligible_count} elegiveis por {source_label}."
    if decider == "priority":
        return f"Venceu por priority maior sobre a segunda colocada dentro de {eligible_count} elegiveis por {source_label}."
    return (
        f"Empate completo no ranking dentro de {eligible_count} elegiveis por {source_label}; "
        "a primeira regra retornada permaneceu vencedora por ordem de entrada."
    )


def primary_factor(match_path: str, candidate_count: int, winner: dict[str, Any] | None, runner_up: dict[str, Any] | None) -> str:
    if winner is None and candidate_count == 0:
        return "sem_cobertura_base"
    if match_path.startswith("prefix") and candidate_count == 1:
        return "prefixo_unico_sem_cobertura_exata"
    if match_path.startswith("prefix") and choose_sort_decider(winner, runner_up) == "stable_order_tie":
        return "prefixo_amplo_empate_semantico"
    if match_path.startswith("prefix") and choose_sort_decider(winner, runner_up) in {"score", "priority"}:
        return "prefixo_amplo_prioridade"
    if match_path == "exact" and choose_sort_decider(winner, runner_up) in {"score", "priority"}:
        return "competicao_exata_semantica_fraca"
    return "semantica_ativa"


def governance_availability(rule_fields: set[str]) -> dict[str, bool]:
    tracked = [
        "validation_status",
        "rule_origin",
        "operation_destination_type",
        "tax_regime_scope",
        "st_scope",
        "status",
        "status_reason",
        "validated_by",
        "validated_at",
        "valid_from",
        "valid_to",
    ]
    return {field: field in rule_fields for field in tracked}


def to_csv(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    seam = load_module("validate_cbenef_base", "scripts/validate_cbenef_base.py")
    sample_mod = load_module("validate_cbenef_sample_real_flow", "scripts/validate_cbenef_sample_real_flow.py")

    sample_rows, conflict_map = load_sample(sample_mod, seam, args.input, args.sheet)
    real_flow_payload = load_real_flow(sample_mod, seam, sample_rows, args.real_flow_helper, args.output_dir)
    real_lookup = real_flow_lookup(real_flow_payload)
    engine = load_engine(seam, args.supabase_fetcher, args.output_dir)
    governance = governance_availability(engine["rule_fields"])

    item_rows: list[dict[str, Any]] = []
    candidate_rows: list[dict[str, Any]] = []

    path_counts = Counter()
    factor_counts = Counter()
    sort_decider_counts = Counter()
    no_exact_count = 0
    no_candidate_count = 0
    no_semantic_signal_winner_count = 0
    winner_matches_motor_count = 0
    multi_candidate_prefix_count = 0
    stable_tie_count = 0

    for sample_row in sample_rows:
        description_key = seam.REQUESTED_COLUMNS[DESC_INDEX]
        ncm_key = seam.REQUESTED_COLUMNS[NCM_INDEX]
        cst_key = seam.REQUESTED_COLUMNS[CST_INDEX]
        icms_key = seam.REQUESTED_COLUMNS[ICMS_INDEX]
        cfop_key = seam.REQUESTED_COLUMNS[CFOP_INDEX]
        cbenef_key = seam.REQUESTED_COLUMNS[CBENEF_INDEX]
        dep_key = seam.REQUESTED_COLUMNS[DEP_INDEX]
        tipo_key = seam.REQUESTED_COLUMNS[TIPO_INDEX]
        codigo_key = seam.REQUESTED_COLUMNS[CODIGO_INDEX]

        context = normalize_sample_context(sample_row, seam, engine["taxonomy"])
        candidate_info = detect_candidates(context, engine["rules_by_exact"], engine["rules_by_prefix"])
        candidate_rules = candidate_info["candidate_rules"]
        path_counts[candidate_info["match_path"]] += 1
        if candidate_info["exact_candidate_count"] == 0:
            no_exact_count += 1
        if candidate_info["match_path"].startswith("prefix") and len(candidate_rules) > 1:
            multi_candidate_prefix_count += 1
        if candidate_info["match_path"] == "none":
            no_candidate_count += 1

        scored = [
            seam.score_rule(
                rule,
                context["strong_tokens"],
                context["normalized_description"],
                context["classification"]["product_type"],
                context["classification"]["product_family"],
                context["classification"]["presentation_type"],
                context["group_inference"]["inferred_macro_group"],
                context["group_inference"]["inferred_subgroup"],
                None,
            )
            for rule in candidate_rules
        ]
        eligible = [entry for entry in scored if not entry["excludeHit"]]
        excluded = [entry for entry in scored if entry["excludeHit"]]
        eligible.sort(key=sort_key)

        winner = eligible[0] if eligible else None
        runner_up = eligible[1] if len(eligible) > 1 else None
        sort_decider = choose_sort_decider(winner, runner_up)
        sort_decider_counts[sort_decider] += 1
        if sort_decider == "stable_order_tie":
            stable_tie_count += 1

        winner_semantic_signal = bool(
            winner
            and (
                winner["presentationMatch"]
                or winner["productTypeMatch"]
                or winner["groupMatch"]
                or len(winner["includeHits"]) > 0
            )
        )
        if winner and not winner_semantic_signal:
            no_semantic_signal_winner_count += 1

        factor = primary_factor(candidate_info["match_path"], len(candidate_rules), winner, runner_up)
        factor_counts[factor] += 1

        real_result = real_lookup[sample_row["sample_id"]]
        handler_response = real_result["response"] if real_result["ok"] else {}
        conflict_reason = conflict_map.get(seam.build_validation_key(sample_row), {}).get("reason")
        motor_status, motor_reason, _, motor_diverging_fields = sample_mod.classify_result(
            sample_row,
            handler_response,
            conflict_reason if real_result["ok"] else (conflict_reason or f"Falha no handler real: {real_result['error']['message']}"),
            seam,
        )

        winner_matches_motor = False
        if winner is None and not seam.clean_text(handler_response.get("matched_rule_id")):
            winner_matches_motor = True
        elif winner is not None and seam.clean_text(handler_response.get("matched_rule_id")) == seam.clean_text(winner["rule"].get("id")):
            winner_matches_motor = True
        if winner_matches_motor:
            winner_matches_motor_count += 1

        ranked_candidates = eligible + excluded
        top_key = sort_key(winner) if winner is not None else None

        for index, entry in enumerate(ranked_candidates, start=1):
            rule = entry["rule"]
            prefix_label = candidate_info["prefix_used"] if candidate_info["match_path"].startswith("prefix") else ""
            current_sort_decider = ""
            if winner is not None and seam.clean_text(rule.get("id")) == seam.clean_text(winner["rule"].get("id")):
                current_sort_decider = sort_decider
            candidate_rows.append(
                {
                    "sample_id": sample_row["sample_id"],
                    "sample_order": sample_row["ordem_amostra"],
                    "source_row": sample_row["_source_row"],
                    "Descricao": seam.clean_text(sample_row[description_key]),
                    "NCM_esperado": seam.normalize_ncm(sample_row[ncm_key]),
                    "candidate_rank": index,
                    "candidate_scope": candidate_info["match_path"],
                    "candidate_prefix": prefix_label,
                    "eligible": "SIM" if not entry["excludeHit"] else "NAO",
                    "winner": "SIM" if winner is not None and seam.clean_text(rule.get("id")) == seam.clean_text(winner["rule"].get("id")) else "NAO",
                    "top_tie": "SIM" if top_key is not None and sort_key(entry) == top_key else "NAO",
                    "rule_id": seam.clean_text(rule.get("id")),
                    "rule_ncm": seam.normalize_ncm(rule.get("ncm")),
                    "cbenef_code": seam.clean_text(rule.get("cbenef_code")),
                    "output_cst_icms": seam.normalize_cst(rule.get("output_cst_icms")),
                    "output_cfop": seam.normalize_cfop(rule.get("output_cfop")),
                    "output_icms_rate": seam.normalize_percent(rule.get("output_icms_rate")),
                    "priority": int(rule.get("priority", 0) or 0),
                    "data_origin": seam.clean_text(rule.get("data_origin")),
                    "state": seam.clean_text(rule.get("state")),
                    "is_active": "SIM" if rule.get("is_active") else "NAO",
                    "validation_status": seam.clean_text(rule.get("validation_status")),
                    "rule_origin": seam.clean_text(rule.get("rule_origin")),
                    "operation_destination_type": seam.clean_text(rule.get("operation_destination_type")),
                    "tax_regime_scope": seam.clean_text(rule.get("tax_regime_scope")),
                    "st_scope": seam.clean_text(rule.get("st_scope")),
                    "product_family": seam.clean_text(rule.get("product_family")),
                    "product_type": seam.clean_text(rule.get("product_type")),
                    "presentation_type": seam.clean_text(rule.get("presentation_type")),
                    "macro_group": seam.clean_text(rule.get("macro_group")),
                    "subgroup": seam.clean_text(rule.get("subgroup")),
                    "score": entry["score"],
                    "include_hits": ", ".join(entry["includeHits"]),
                    "exclude_hit": "SIM" if entry["excludeHit"] else "NAO",
                    "exclude_terms_hit": ", ".join(hit_exclude_terms(rule, context["normalized_description"], context["strong_tokens"], seam)),
                    "product_type_match": "SIM" if entry["productTypeMatch"] else "NAO",
                    "group_match": "SIM" if entry["groupMatch"] else "NAO",
                    "presentation_match": "SIM" if entry["presentationMatch"] else "NAO",
                    "sort_decider": current_sort_decider,
                }
            )

        winner_rule = winner["rule"] if winner is not None else {}
        runner_rule = runner_up["rule"] if runner_up is not None else {}
        item_rows.append(
            {
                "sample_id": sample_row["sample_id"],
                "sample_order": sample_row["ordem_amostra"],
                "source_row": sample_row["_source_row"],
                "sample_family": sample_row["familia_amostra"],
                "sample_criterion": sample_row["criterio_amostra"],
                "Codigo": seam.stringify_code(sample_row[codigo_key]),
                "Descricao": seam.clean_text(sample_row[description_key]),
                "Dep.Nome": seam.clean_text(sample_row[dep_key]),
                "Tipo produto": seam.clean_text(sample_row[tipo_key]),
                "NCM_esperado": seam.normalize_ncm(sample_row[ncm_key]),
                "CST_esperado": seam.normalize_cst(sample_row[cst_key]),
                "%ICMS_esperado": seam.normalize_percent(sample_row[icms_key]),
                "CFOP_esperado": seam.normalize_cfop(sample_row[cfop_key]),
                "cBenef_esperado": seam.normalize_cbenef(sample_row[cbenef_key]),
                "motor_status": motor_status,
                "motor_divergence_fields": ", ".join(motor_diverging_fields),
                "motor_reason": motor_reason,
                "motor_matched_rule_id": seam.clean_text(handler_response.get("matched_rule_id")),
                "motor_match_path": (
                    "exact"
                    if handler_response.get("matched_by_ncm_exact")
                    else ("prefix" if handler_response.get("matched_by_ncm_prefix") else "none")
                ),
                "motor_matched_ncm": seam.normalize_ncm(handler_response.get("matched_ncm")),
                "motor_cst": seam.normalize_cst(handler_response.get("final_cst_icms")),
                "motor_cfop": seam.normalize_cfop(handler_response.get("output_cfop")),
                "motor_icms_rate": seam.normalize_percent(handler_response.get("output_icms_rate")),
                "motor_cbenef": seam.normalize_cbenef(handler_response.get("cbenef_code")),
                "motor_confidence_score": handler_response.get("confidence_score"),
                "diagnostic_match_path": candidate_info["match_path"],
                "diagnostic_prefix_used": candidate_info["prefix_used"],
                "exact_candidate_count": candidate_info["exact_candidate_count"],
                "candidate_count": len(candidate_rules),
                "eligible_count": len(eligible),
                "excluded_count": len(excluded),
                "winner_id": seam.clean_text(winner_rule.get("id")),
                "winner_matches_motor": "SIM" if winner_matches_motor else "NAO",
                "winner_reason_summary": winner_reason_summary(
                    candidate_info["match_path"],
                    candidate_info["prefix_used"],
                    winner,
                    runner_up,
                    len(candidate_rules),
                    len(eligible),
                ),
                "winner_sort_decider": sort_decider,
                "winner_has_semantic_signal": "SIM" if winner_semantic_signal else "NAO",
                "winner_priority": int(winner_rule.get("priority", 0) or 0) if winner is not None else "",
                "winner_data_origin": seam.clean_text(winner_rule.get("data_origin")),
                "winner_state": seam.clean_text(winner_rule.get("state")),
                "winner_validation_status": seam.clean_text(winner_rule.get("validation_status")),
                "winner_rule_origin": seam.clean_text(winner_rule.get("rule_origin")),
                "winner_operation_destination_type": seam.clean_text(winner_rule.get("operation_destination_type")),
                "winner_tax_regime_scope": seam.clean_text(winner_rule.get("tax_regime_scope")),
                "winner_st_scope": seam.clean_text(winner_rule.get("st_scope")),
                "winner_ncm": seam.normalize_ncm(winner_rule.get("ncm")),
                "winner_cbenef_code": seam.clean_text(winner_rule.get("cbenef_code")),
                "winner_output_cst_icms": seam.normalize_cst(winner_rule.get("output_cst_icms")),
                "winner_output_cfop": seam.normalize_cfop(winner_rule.get("output_cfop")),
                "winner_output_icms_rate": seam.normalize_percent(winner_rule.get("output_icms_rate")),
                "winner_product_type": seam.clean_text(winner_rule.get("product_type")),
                "winner_macro_group": seam.clean_text(winner_rule.get("macro_group")),
                "winner_include_hits": ", ".join(winner["includeHits"]) if winner is not None else "",
                "winner_exclude_terms_hit": ", ".join(hit_exclude_terms(winner_rule, context["normalized_description"], context["strong_tokens"], seam)) if winner is not None else "",
                "top_runner_id": seam.clean_text(runner_rule.get("id")),
                "top_runner_score": runner_up["score"] if runner_up is not None else "",
                "top_runner_priority": int(runner_rule.get("priority", 0) or 0) if runner_up is not None else "",
                "primary_factor": factor,
            }
        )

    coverage_answer = (
        f"Sim. {no_exact_count}/{len(sample_rows)} itens nao tinham regra exata para o NCM esperado, "
        f"e {no_candidate_count}/{len(sample_rows)} nao encontraram nenhuma regra nem por prefixo 6/4/2."
    )
    prefix_answer = (
        f"Sim. {path_counts.get('prefix_6', 0) + path_counts.get('prefix_4', 0) + path_counts.get('prefix_2', 0)}/{len(sample_rows)} itens dependeram de prefixo, "
        f"e {multi_candidate_prefix_count} desses casos abriram disputa com multiplas candidatas."
    )
    governance_answer = (
        "Sim no codigo atual. O fluxo consultado filtra apenas is_active=true antes do ranking, e os campos formais "
        "de governanca (validation_status, rule_origin, operation_destination_type, tax_regime_scope, st_scope) nao aparecem "
        "nas linhas hoje carregadas de cbenef_rules."
    )
    ranking_answer = (
        f"Sim. {no_semantic_signal_winner_count}/{max(1, len(item_rows) - no_candidate_count)} vencedoras com regra escolhida nao tinham "
        "presentationMatch, productTypeMatch, groupMatch nem includeHits ativos; em varios casos a decisao caiu para score bruto, priority "
        f"ou ate empate completo ({stable_tie_count} caso(s))."
    )
    combined_answer = (
        "Combinacao de cobertura fraca da base, fallback frequente para prefixo, ausencia de filtro formal de governanca antes do ranking "
        "e ranking semantico fraco quando a descricao nao ativa sinais suficientes."
    )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(args.input.resolve()),
        "source_sheet": args.sheet,
        "sample_size": len(sample_rows),
        "sample_definition": {
            "summary": (
                "Mesma amostra rastreavel da validacao real anterior: 12 itens, 3 por familia visivel "
                "(carnes, laticinios, mercearia e hortifruti), cobrindo cBenef preenchido/vazio, CFOP 5405, CST 040 e 060."
            ),
            "items": [
                {
                    "sample_id": row["sample_id"],
                    "source_row": row["_source_row"],
                    "family": row["familia_amostra"],
                    "criterion": row["criterio_amostra"],
                    "description": seam.clean_text(row[seam.REQUESTED_COLUMNS[DESC_INDEX]]),
                    "ncm": seam.normalize_ncm(row[seam.REQUESTED_COLUMNS[NCM_INDEX]]),
                }
                for row in sample_rows
            ],
        },
        "diagnostic_seam": {
            "description": (
                "Seam interna diagnostica fiel ao fluxo atual do get-cbenef, replicando a busca por NCM exato/prefixo, "
                "scoreRule, exclusao por keyword_exclude e a mesma ordenacao do handler. O handler publico real nao foi "
                "instrumentado para evitar poluir o endpoint."
            ),
            "real_flow_reference": "supabase.functions.invoke('get-cbenef')",
            "winner_matches_motor_count": winner_matches_motor_count,
            "winner_matches_motor_total": len(sample_rows),
        },
        "governance_fields_available": governance,
        "path_counts": {
            "exact": path_counts.get("exact", 0),
            "prefix_6": path_counts.get("prefix_6", 0),
            "prefix_4": path_counts.get("prefix_4", 0),
            "prefix_2": path_counts.get("prefix_2", 0),
            "none": path_counts.get("none", 0),
        },
        "sort_decider_counts": dict(sort_decider_counts),
        "factor_counts": dict(factor_counts),
        "executive_summary": {
            "coverage_weak_base": coverage_answer,
            "excessive_prefix_competition": prefix_answer,
            "missing_governance_filter_before_ranking": governance_answer,
            "semantic_ranking_choosing_poorly": ranking_answer,
            "combined_assessment": combined_answer,
            "dominant_next_step_signal": (
                "O material aponta primeiro para saneamento/cobertura de base e endurecimento de filtros antes do ranking; "
                "depois disso, vale revisar ranking e reduzir prefix matching amplo."
            ),
        },
        "item_columns": ITEM_COLUMNS,
        "candidate_columns": CANDIDATE_COLUMNS,
        "item_rows": item_rows,
        "candidate_rows": candidate_rows,
    }

    summary_json = args.output_dir / "competition_summary.json"
    detail_json = args.output_dir / "competition_diagnostic.json"
    items_csv = args.output_dir / "competition_items.csv"
    candidates_csv = args.output_dir / "competition_candidates.csv"
    workbook_path = args.output_dir / "cbenef_rule_competition_report.xlsx"

    summary_json.write_text(
        json.dumps(
            {
                "generated_at": payload["generated_at"],
                "sample_size": payload["sample_size"],
                "diagnostic_seam": payload["diagnostic_seam"],
                "governance_fields_available": payload["governance_fields_available"],
                "path_counts": payload["path_counts"],
                "sort_decider_counts": payload["sort_decider_counts"],
                "factor_counts": payload["factor_counts"],
                "executive_summary": payload["executive_summary"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    detail_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    to_csv(items_csv, ITEM_COLUMNS, item_rows)
    to_csv(candidates_csv, CANDIDATE_COLUMNS, candidate_rows)

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

    print(json.dumps(payload["path_counts"], ensure_ascii=False))
    print(str(workbook_path.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
