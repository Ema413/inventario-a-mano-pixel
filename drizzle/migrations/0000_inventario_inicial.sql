
CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  pin_hash text,
  pin_salt text,
  pin_version integer NOT NULL DEFAULT 1,
  backup_reminder_days integer NOT NULL DEFAULT 7 CHECK (backup_reminder_days BETWEEN 1 AND 365),
  last_backup_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_settings (id) VALUES (true);

CREATE TABLE public.pin_attempts (
  client_key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pin_attempts TO service_role;
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_unique ON public.categories (lower(trim(name)));
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX locations_name_unique ON public.locations (lower(trim(name)));
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{6}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  description text,
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'unidades',
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  min_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  notes text,
  photo_path text,
  photo_size integer,
  embedding jsonb,
  embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_name_idx ON public.items (lower(name));
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.items_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'El código de un artículo no se puede modificar' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER items_guard_update BEFORE UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.items_guard_update();

CREATE TABLE public.movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  item_code text NOT NULL,
  item_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('alta','entrada','salida','reposicion','ajuste','modificacion','baja')),
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  quantity_before numeric(14,3),
  quantity_after numeric(14,3),
  unit text,
  reason text,
  notes text,
  actor text NOT NULL DEFAULT 'Acceso compartido del centro',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movements_created_idx ON public.movements (created_at DESC);
CREATE INDEX movements_item_idx ON public.movements (item_id);
CREATE INDEX movements_code_idx ON public.movements (item_code);
GRANT ALL ON public.movements TO service_role;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

-- Atomic stock movement. For 'ajuste', p_quantity is the new total.
CREATE OR REPLACE FUNCTION public.apply_movement(
  p_item_id uuid, p_type text, p_quantity numeric, p_reason text, p_notes text
) RETURNS public.movements
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_item public.items;
  v_after numeric;
  v_delta numeric;
  v_mov public.movements;
BEGIN
  IF p_type NOT IN ('entrada','salida','reposicion','ajuste') THEN
    RAISE EXCEPTION 'Tipo de movimiento no válido' USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 OR (p_type <> 'ajuste' AND p_quantity = 0) THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero' USING ERRCODE = 'P0001';
  END IF;
  IF p_type = 'ajuste' AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'El ajuste requiere un motivo' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El artículo no existe' USING ERRCODE = 'P0001';
  END IF;

  IF p_type IN ('entrada','reposicion') THEN
    v_after := v_item.quantity + p_quantity; v_delta := p_quantity;
  ELSIF p_type = 'salida' THEN
    IF p_quantity > v_item.quantity THEN
      RAISE EXCEPTION 'No hay suficiente stock: disponible %', v_item.quantity USING ERRCODE = 'P0001';
    END IF;
    v_after := v_item.quantity - p_quantity; v_delta := p_quantity;
  ELSE
    IF p_quantity = v_item.quantity THEN
      RAISE EXCEPTION 'La nueva cantidad es igual a la actual' USING ERRCODE = 'P0001';
    END IF;
    v_after := p_quantity; v_delta := p_quantity - v_item.quantity;
  END IF;

  UPDATE public.items SET quantity = v_after WHERE id = p_item_id;

  INSERT INTO public.movements (item_id, item_code, item_name, type, quantity, quantity_before, quantity_after, unit, reason, notes)
  VALUES (v_item.id, v_item.code, v_item.name, p_type, v_delta, v_item.quantity, v_after, v_item.unit,
          NULLIF(trim(coalesce(p_reason,'')), ''), NULLIF(trim(coalesce(p_notes,'')), ''))
  RETURNING * INTO v_mov;
  RETURN v_mov;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_movement(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_movement(uuid, text, numeric, text, text) TO service_role;

-- Replace all inventory data from a verified backup, in one transaction.
CREATE OR REPLACE FUNCTION public.restore_backup(p_data jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.movements WHERE true;
  DELETE FROM public.items WHERE true;
  DELETE FROM public.categories WHERE true;
  DELETE FROM public.locations WHERE true;

  INSERT INTO public.categories (id, name, created_at)
  SELECT id, name, created_at FROM jsonb_populate_recordset(NULL::public.categories, coalesce(p_data->'categories','[]'::jsonb));

  INSERT INTO public.locations (id, name, created_at)
  SELECT id, name, created_at FROM jsonb_populate_recordset(NULL::public.locations, coalesce(p_data->'locations','[]'::jsonb));

  INSERT INTO public.items
  SELECT * FROM jsonb_populate_recordset(NULL::public.items, coalesce(p_data->'items','[]'::jsonb));

  INSERT INTO public.movements
  SELECT * FROM jsonb_populate_recordset(NULL::public.movements, coalesce(p_data->'movements','[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.restore_backup(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_backup(jsonb) TO service_role;
