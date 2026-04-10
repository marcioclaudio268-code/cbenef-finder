import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, AlertTriangle, XCircle, ExternalLink,
  Clock, Shield, Scale, Info, FileText, Tag, Truck, MessageSquare
} from "lucide-react";

export interface CbenefResult {
  cbenef_code: string;
  informed_cst_icms: string;
  suggested_cst_icms: string;
  final_cst_icms: string;
  cst_source: "informado" | "sugerido" | "ajustado" | "none";
  cst_warning?: string;
  confidence_score: number;
  confidence_level: "high" | "medium" | "low";
  matched_rule_id: string | null;
  application_context: string;
  legal_basis_name: string;
  legal_basis_summary: string;
  legal_basis_url: string | null;
  rule_version: {
    version_label: string;
    version_code: string | null;
    published_at: string;
  } | null;
  last_updated_at: string;
  input_ncm: string;
  matched_ncm: string;
  explanation: string;
  matched_by_ncm_exact: boolean;
  matched_by_ncm_prefix: boolean;
  keyword_match_count: number;
  used_informed_cst: boolean;
  auto_suggested_cst: boolean;
  data_origin?: string;
  // Semantic fields
  normalized_description?: string;
  matched_keywords?: string[];
  excluded_keywords_hit?: string[];
  product_family?: string;
  product_type?: string;
  presentation_type?: string;
  output_st_applicable?: boolean | null;
  output_trib_code?: string;
  output_cfop?: string;
  decision_reason?: string;
}

interface ResultadoCardProps {
  result: CbenefResult;
}

function getConfidenceBadge(level: string, score: number) {
  const pct = Math.round(score * 100);
  switch (level) {
    case "high":
      return (
        <Badge className="bg-success text-success-foreground gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          Alta confiança ({pct}%)
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-warning text-warning-foreground gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Média confiança ({pct}%)
        </Badge>
      );
    default:
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3.5 h-3.5" />
          Confiança insuficiente ({pct}%)
        </Badge>
      );
  }
}

function getCstLabel(source: string) {
  switch (source) {
    case "informado":
      return { text: "Informado pelo usuário", icon: CheckCircle, color: "text-success" };
    case "sugerido":
      return { text: "Sugerido pelo sistema", icon: Info, color: "text-primary" };
    case "ajustado":
      return { text: "Ajustado após validação", icon: AlertTriangle, color: "text-warning" };
    default:
      return { text: "Não identificado", icon: XCircle, color: "text-muted-foreground" };
  }
}

function formatLabel(val: string | undefined | null): string {
  if (!val || val === "nao_identificado" || val === "padrao") return "—";
  return val.charAt(0).toUpperCase() + val.slice(1).replace(/_/g, " ");
}

export function ResultadoCard({ result }: ResultadoCardProps) {
  const isLowConfidence = result.confidence_level === "low";
  const cstLabel = getCstLabel(result.cst_source);
  const CstIcon = cstLabel.icon;

  const hasSemanticInfo = result.product_family || result.product_type;
  const hasTribInfo = result.output_trib_code || result.output_cfop;

  return (
    <Card className="w-full max-w-2xl mx-auto mt-6 shadow-lg border-border/60 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold text-foreground">Resultado da Consulta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* A. Situação de aplicação */}
        <div className="rounded-lg bg-secondary/70 border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Situação de aplicação desta resposta</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Estado:</span>
            <span className="text-foreground font-medium">São Paulo</span>
            <span className="text-muted-foreground">Operação:</span>
            <span className="text-foreground font-medium">Interna</span>
            <span className="text-muted-foreground">Contexto:</span>
            <span className="text-foreground font-medium">{result.application_context || "Emissão conforme regras parametrizadas da base atual"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Esta resposta vale exclusivamente para o contexto acima. Operações interestaduais ou com outro perfil podem ter regras diferentes.
          </p>
        </div>

        {isLowConfidence ? (
          <div className="text-center py-6 space-y-3">
            <XCircle className="w-12 h-12 mx-auto text-destructive/70" />
            <p className="text-foreground font-medium">
              Não foi possível sugerir um cBenef com segurança com base nos dados informados.
            </p>
            <p className="text-sm text-muted-foreground">{result.explanation}</p>
            {result.cst_warning && (
              <p className="text-sm text-warning">{result.cst_warning}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Verifique os dados informados ou consulte a legislação vigente do estado de São Paulo.
            </p>
            {getConfidenceBadge(result.confidence_level, result.confidence_score)}
            {/* Show identified type even on low confidence */}
            {hasSemanticInfo && (
              <div className="mt-4 text-left rounded-lg bg-secondary/50 p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo fiscal identificado na descrição</p>
                <p className="text-sm text-foreground">
                  {formatLabel(result.product_family)} → {formatLabel(result.product_type)} → {formatLabel(result.presentation_type)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* B. Resultado principal */}
            <div className="rounded-lg bg-secondary p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Código cBenef Sugerido
              </p>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-3xl font-bold font-mono text-primary">{result.cbenef_code}</p>
                {getConfidenceBadge(result.confidence_level, result.confidence_score)}
              </div>
            </div>

            {/* Warnings */}
            {result.cst_warning && (
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{result.cst_warning}</p>
              </div>
            )}

            {/* Tipo fiscal identificado */}
            {hasSemanticInfo && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Tipo fiscal identificado</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <InfoBlock label="Família" value={formatLabel(result.product_family)} />
                  <InfoBlock label="Tipo" value={formatLabel(result.product_type)} />
                  <InfoBlock label="Apresentação" value={formatLabel(result.presentation_type)} />
                </div>
              </div>
            )}

            {/* Tributação sugerida */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Tributação sugerida</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">CST Final</p>
                  <p className="text-lg font-bold font-mono text-foreground">{result.final_cst_icms || "—"}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <CstIcon className={`w-3 h-3 ${cstLabel.color}`} />
                    <span className={`text-xs ${cstLabel.color}`}>{cstLabel.text}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">ST Aplicável</p>
                  <p className="text-lg font-bold font-mono text-foreground">
                    {result.output_st_applicable === true ? "Sim" : result.output_st_applicable === false ? "Não" : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Cód. Tributação</p>
                  <p className="text-lg font-bold font-mono text-foreground">{result.output_trib_code || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">CFOP</p>
                  <p className="text-lg font-bold font-mono text-foreground">{result.output_cfop || "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">NCM Considerado</p>
                <p className="text-sm font-mono text-foreground">{result.matched_ncm || result.input_ncm}</p>
                {result.matched_ncm && result.matched_ncm !== result.input_ncm && (
                  <p className="text-xs text-muted-foreground mt-0.5">Informado: {result.input_ncm}</p>
                )}
              </div>
            </div>

            {/* Por que esta resposta foi escolhida */}
            {result.decision_reason && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Por que esta resposta foi escolhida</p>
                </div>
                <p className="text-sm text-foreground">{result.decision_reason}</p>
                {result.matched_keywords && result.matched_keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-xs text-muted-foreground">Palavras-chave:</span>
                    {result.matched_keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Base legal */}
            {(result.legal_basis_name || result.legal_basis_summary) && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Base legal</p>
                </div>
                {result.legal_basis_name && <InfoBlock label="Norma / Referência" value={result.legal_basis_name} />}
                {result.legal_basis_summary && <InfoBlock label="Resumo" value={result.legal_basis_summary} />}
                {result.legal_basis_url && (
                  <a href={result.legal_basis_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
                    <ExternalLink className="w-4 h-4" />Ver fonte legal completa
                  </a>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1 border-t border-border mt-2">
                  {result.rule_version && (
                    <span>Versão: {result.rule_version.version_code || result.rule_version.version_label}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Atualização: {new Date(result.last_updated_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            )}

            {/* Explicação */}
            <div className="pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground italic">{result.explanation}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
