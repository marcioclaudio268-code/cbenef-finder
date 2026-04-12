import { useState, useEffect } from "react";
import { ConsultaForm, type ConsultaFormData } from "@/components/ConsultaForm";
import { ResultadoCard } from "@/components/ResultadoCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { FileText, Clock } from "lucide-react";
import type { CbenefResult, CbenefRuleVersion } from "@/types/cbenef";

function formatRuleVersion(version: Pick<CbenefRuleVersion, "version_code" | "version_label">) {
  return version.version_code || version.version_label;
}

function formatRuleVersionDate(publishedAt: string) {
  return new Date(publishedAt).toLocaleDateString("pt-BR");
}

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CbenefResult | null>(null);
  const [baseInfo, setBaseInfo] = useState<{ version: string; date: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCurrentBaseInfo = async () => {
      const { data } = await supabase
        .from("rule_versions")
        .select("version_label, version_code, published_at, created_at")
        .eq("is_current", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isMounted || !data) return;

      setBaseInfo({
        version: formatRuleVersion(data),
        date: formatRuleVersionDate(data.published_at || data.created_at),
      });
    };

    void loadCurrentBaseInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleConsulta = async (data: ConsultaFormData) => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data: response, error } = await supabase.functions.invoke("get-cbenef", {
        body: {
          ean: data.ean || undefined,
          descricao: data.descricao || undefined,
          ncm: data.ncm,
          cst_icms: data.cst_icms || undefined,
          marca: data.marca || undefined,
          grupo: data.grupo || undefined,
        },
      });

      if (error) throw error;
      const typedResponse = response as CbenefResult;
      setResult(typedResponse);

      if (typedResponse.rule_version) {
        setBaseInfo({
          version: formatRuleVersion(typedResponse.rule_version),
          date: formatRuleVersionDate(typedResponse.rule_version.published_at),
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast({
        title: "Erro na consulta",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container max-w-4xl mx-auto py-4 px-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2">
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Consulta cBenef</h1>
            <p className="text-xs text-muted-foreground">Código de Benefício Fiscal — SP</p>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto py-8 px-4 space-y-6 flex-1">
        <ConsultaForm onSubmit={handleConsulta} isLoading={isLoading} />
        {result && <ResultadoCard result={result} />}
      </main>

      <footer className="border-t border-border">
        <div className="container max-w-4xl mx-auto py-4 px-4 text-center text-xs text-muted-foreground space-y-1">
          <p>
            Este serviço oferece sugestões com base nas regras vigentes do Estado de São Paulo.
            Consulte sempre a legislação oficial antes de tomar decisões fiscais.
          </p>
          {baseInfo && (
            <p className="flex items-center justify-center gap-1.5 opacity-60">
              <Clock className="w-3 h-3" />
              Base: {baseInfo.version} · Atualizada em {baseInfo.date}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
};

export default Index;
