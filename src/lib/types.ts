import type { MovementType } from "./inventory-rules";

export type ItemDTO = {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  location_id: string | null;
  location_name: string | null;
  min_stock: number;
  notes: string | null;
  photo_url: string | null;
  has_photo: boolean;
  has_embedding: boolean;
  created_at: string;
  updated_at: string;
};

export type MovementDTO = {
  id: string;
  item_id: string | null;
  item_code: string;
  item_name: string;
  type: MovementType;
  quantity: number;
  quantity_before: number | null;
  quantity_after: number | null;
  unit: string | null;
  reason: string | null;
  notes: string | null;
  actor: string;
  created_at: string;
};

export type NamedEntity = { id: string; name: string; item_count: number };

export type VisualIndexEntry = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  location_name: string | null;
  photo_url: string | null;
  embedding: number[];
};
