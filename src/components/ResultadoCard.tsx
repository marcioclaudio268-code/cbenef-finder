import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, ExternalLink, Clock } from "lucide-react";

export interface CbenefResult {
  cbenef_code: string;
  confidence_score: number;
  confidence_level: "high" | "medium" | "low" | "none";
  rule_description: string;
  cst_considered: string;
  ncm_considered: string;
  legal_basis: string;
  legal_url: string | null;
  matched_by: string;
  base_date: string;
}

interface ResultadoCardProps {
  result: CbenefResult;
}

function getConfidenceBadge(level: string, score: number) {
  switch (level) {
    case "high":
      return (
        <Badge className="bg-success text-success-foreground gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          Alta confiança ({score}%)
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-warning text-warning-foreground gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Média confiança ({score}%) — validação recomendada
        </Badge>
      );
    default:
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3.5 h-3.5" />
          Sem correspondência segura
        </Badge>
      );
  }
}

export function ResultadoCard({ result }: ResultadoCardProps) {
  const isNoMatch = result.confidence_level === "none" || result.confidence_level === "low";

  return (
    <Card className="w-full max-w-2xl mx-auto mt-6 shadow-lg border-border/60 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg font-bold text-foreground">Resultado da Consulta</CardTitle>
          {getConfidenceBadge(result.confidence_level, result.confidence_score)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isNoMatch ? (
          <>
            <div className="rounded-lg bg-secondary p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Código cBenef Sugerido
              </p>
              <p className="text-3xl font-bold font-mono text-primary">{result.cbenef_code}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InfoBlock label="NCM Considerado" value={result.ncm_considered} mono />
              <InfoBlock label="CST Considerado" value={result.cst_considered} mono />
            </div>

            <InfoBlock label="Regra Encontrada" value={result.rule_description} />
            <InfoBlock label="Fundamento Resumido" value={result.legal_basis} />
            <InfoBlock label="Correspondência por" value={result.matched_by} />

            {result.legal_url && (
              <a
                href={result.legal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Ver base legal completa
              </a>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t border-border">
              <Clock className="w-3.5 h-3.5" />
              Base utilizada em: {result.base_date}
            </div>
          </>
        ) : (
          <div className="text-center py-6 space-y-2">
            <XCircle className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-foreground font-medium">
              Não foi possível sugerir o código cBenef com segurança.
            </p>
            <p className="text-sm text-muted-foreground">
              Verifique os dados informados ou consulte a legislação vigente do estado de São Paulo.
            </p>
          </div>
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
