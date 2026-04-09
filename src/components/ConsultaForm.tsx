import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2 } from "lucide-react";

export interface ConsultaFormData {
  ean: string;
  descricao: string;
  ncm: string;
  cst_icms: string;
  marca: string;
}

interface ConsultaFormProps {
  onSubmit: (data: ConsultaFormData) => void;
  isLoading: boolean;
}

export function ConsultaForm({ onSubmit, isLoading }: ConsultaFormProps) {
  const [form, setForm] = useState<ConsultaFormData>({
    ean: "",
    descricao: "",
    ncm: "",
    cst_icms: "",
    marca: "",
  });

  const handleChange = (field: keyof ConsultaFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const isValid = form.ncm.trim().length > 0 && form.descricao.trim().length > 0;

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-lg border-border/60">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold text-foreground">Consulta cBenef</CardTitle>
        <CardDescription className="text-muted-foreground">
          Informe os dados do produto para receber o código cBenef sugerido — Estado de São Paulo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ean" className="text-sm font-medium">
                EAN <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Input
                id="ean"
                placeholder="Ex: 7891234567890"
                value={form.ean}
                onChange={handleChange("ean")}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ncm" className="text-sm font-medium">
                NCM <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ncm"
                placeholder="Ex: 2106.90.10"
                value={form.ncm}
                onChange={handleChange("ncm")}
                required
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao" className="text-sm font-medium">Descrição do Produto</Label>
            <Input
              id="descricao"
              placeholder="Ex: Preparação alimentícia composta"
              value={form.descricao}
              onChange={handleChange("descricao")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cst_icms" className="text-sm font-medium">
                CST ICMS <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Input
                id="cst_icms"
                placeholder="Ex: 00, 20, 40, 60"
                value={form.cst_icms}
                onChange={handleChange("cst_icms")}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Se não souber o CST, deixe em branco. O sistema tentará sugerir o CST mais adequado para a situação informada.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="marca" className="text-sm font-medium">
                Marca <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Input
                id="marca"
                placeholder="Ex: Nestlé"
                value={form.marca}
                onChange={handleChange("marca")}
              />
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!isValid || isLoading}
            className="w-full mt-2 text-base font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" />
                Consultando...
              </>
            ) : (
              <>
                <Search />
                Consultar cBenef
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
