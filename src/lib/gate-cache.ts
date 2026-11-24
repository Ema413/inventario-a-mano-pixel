// Avoids a server round-trip on every in-app navigation; the server still checks every data call.
let lastConfirmed = 0;

export function gateRecentlyConfirmed() {
  return typeof window !== "undefined" && Date.now() - lastConfirmed < 60_000;
}

export function markGateConfirmed() {
  if (typeof window !== "undefined") lastConfirmed = Date.now();
}

export function resetGateCache() {
  lastConfirmed = 0;
}
