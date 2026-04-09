import { useState } from "react";
import { ConsultaForm, type ConsultaFormData } from "@/components/ConsultaForm";
import { ResultadoCard, type CbenefResult } from "@/components/ResultadoCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CbenefResult | null>(null);

  const handleConsulta = async (data: ConsultaFormData) => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data: response, error } = await supabase.functions.invoke("get-cbenef", {
        body: {
          ean: data.ean,
          descricao: data.descricao,
          ncm: data.ncm,
          cst_icms: data.cst_icms,
          marca: data.marca,
        },
      });

      if (error) throw error;
      setResult(response as CbenefResult);
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
    <div className="min-h-screen bg-background">
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

      <main className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
        <ConsultaForm onSubmit={handleConsulta} isLoading={isLoading} />
        {result && <ResultadoCard result={result} />}
      </main>

      <footer className="border-t border-border mt-auto">
        <div className="container max-w-4xl mx-auto py-4 px-4 text-center text-xs text-muted-foreground">
          Este serviço oferece sugestões com base nas regras vigentes do Estado de São Paulo. 
          Consulte sempre a legislação oficial antes de tomar decisões fiscais.
        </div>
      </footer>
    </div>
  );
};

export default Index;
