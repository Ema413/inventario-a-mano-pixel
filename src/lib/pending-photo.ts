// Hands a photo from the scan screen to the new-article form within the same tab.
import type { PreparedPhoto } from "./image";

let pending: { photo: PreparedPhoto; embedding: number[] | null } | null = null;

export function setPendingPhoto(value: { photo: PreparedPhoto; embedding: number[] | null } | null) {
  pending = value;
}

export function takePendingPhoto() {
  const v = pending;
  pending = null;
  return v;
}
