ALTER TABLE public.catalog_companies
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Preserve existing category order and make ties deterministic without using names.
WITH ranked_categories AS (
  SELECT id,
         row_number() OVER (PARTITION BY shop_id ORDER BY sort_order ASC, created_at ASC, id ASC) - 1 AS next_order
  FROM public.catalog_categories
  WHERE deleted_at IS NULL
)
UPDATE public.catalog_categories AS category
SET sort_order = ranked_categories.next_order::integer
FROM ranked_categories
WHERE category.id = ranked_categories.id;

-- Existing companies receive a stable initial order based on creation, never on display names.
WITH ranked_companies AS (
  SELECT id,
         row_number() OVER (PARTITION BY shop_id ORDER BY created_at ASC, id ASC) - 1 AS next_order
  FROM public.catalog_companies
  WHERE deleted_at IS NULL
)
UPDATE public.catalog_companies AS company
SET sort_order = ranked_companies.next_order::integer
FROM ranked_companies
WHERE company.id = ranked_companies.id;

CREATE INDEX IF NOT EXISTS catalog_categories_shop_sort_order_idx
  ON public.catalog_categories (shop_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS catalog_companies_shop_sort_order_idx
  ON public.catalog_companies (shop_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.reorder_catalog_taxonomy(
  p_shop_id uuid,
  p_entity_type text,
  p_ordered_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_count integer;
  v_unique_count integer;
  v_updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_entity_type NOT IN ('categories', 'companies') THEN
    RAISE EXCEPTION 'Invalid taxonomy type' USING ERRCODE = '22023';
  END IF;

  IF p_ordered_ids IS NULL OR cardinality(p_ordered_ids) > 1000 THEN
    RAISE EXCEPTION 'Invalid taxonomy order payload' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_shop_role(p_shop_id, ARRAY['manager', 'admin']::public.shop_role[]) THEN
    RAISE EXCEPTION 'Manager access required for this shop' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT requested.item_id)::integer
  INTO v_unique_count
  FROM unnest(p_ordered_ids) AS requested(item_id);

  IF v_unique_count <> cardinality(p_ordered_ids) THEN
    RAISE EXCEPTION 'Taxonomy IDs must be unique' USING ERRCODE = '22023';
  END IF;

  IF p_entity_type = 'categories' THEN
    SELECT count(*)::integer INTO v_expected_count
    FROM public.catalog_categories
    WHERE shop_id = p_shop_id AND deleted_at IS NULL;
  ELSE
    SELECT count(*)::integer INTO v_expected_count
    FROM public.catalog_companies
    WHERE shop_id = p_shop_id AND deleted_at IS NULL;
  END IF;

  IF v_expected_count <> cardinality(p_ordered_ids) THEN
    RAISE EXCEPTION 'The order must include every active taxonomy item' USING ERRCODE = '22023';
  END IF;

  IF p_entity_type = 'categories' THEN
    UPDATE public.catalog_categories AS category
    SET sort_order = (requested.position - 1)::integer
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS requested(item_id, position)
    WHERE category.id = requested.item_id
      AND category.shop_id = p_shop_id
      AND category.deleted_at IS NULL;
  ELSE
    UPDATE public.catalog_companies AS company
    SET sort_order = (requested.position - 1)::integer
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS requested(item_id, position)
    WHERE company.id = requested.item_id
      AND company.shop_id = p_shop_id
      AND company.deleted_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> cardinality(p_ordered_ids) THEN
    RAISE EXCEPTION 'Not all taxonomy items could be reordered' USING ERRCODE = '42501';
  END IF;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_catalog_taxonomy(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_catalog_taxonomy(uuid, text, uuid[]) TO authenticated;
