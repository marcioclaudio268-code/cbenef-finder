
-- Taxonomia do site: grupos de classificação
CREATE TABLE public.classification_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_id uuid REFERENCES public.classification_groups(id),
  level integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classification_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active classification groups"
  ON public.classification_groups FOR SELECT USING (is_active = true);

CREATE POLICY "Service role manages classification_groups"
  ON public.classification_groups FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Keywords de inferência por grupo
CREATE TABLE public.classification_group_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.classification_groups(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  match_type text NOT NULL DEFAULT 'include',
  weight numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classification_group_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read group keywords"
  ON public.classification_group_keywords FOR SELECT USING (true);

CREATE POLICY "Service role manages group keywords"
  ON public.classification_group_keywords FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Aliases de grupo
CREATE TABLE public.classification_group_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.classification_groups(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classification_group_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read group aliases"
  ON public.classification_group_aliases FOR SELECT USING (true);

CREATE POLICY "Service role manages group aliases"
  ON public.classification_group_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Adicionar macro_group e subgroup na cbenef_rules
ALTER TABLE public.cbenef_rules
  ADD COLUMN IF NOT EXISTS macro_group text,
  ADD COLUMN IF NOT EXISTS subgroup text;
