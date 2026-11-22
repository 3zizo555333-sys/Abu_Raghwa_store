CREATE TABLE IF NOT EXISTS public.virtual_store_layouts (
  id text PRIMARY KEY DEFAULT 'default',
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.virtual_store_layouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.virtual_store_layouts TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.virtual_store_layouts TO service_role;

DROP POLICY IF EXISTS virtual_store_layouts_public_read ON public.virtual_store_layouts;
CREATE POLICY virtual_store_layouts_public_read
  ON public.virtual_store_layouts
  FOR SELECT TO anon, authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
