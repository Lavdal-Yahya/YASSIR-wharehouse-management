// Weighted-average cost update (P7 valuation). Pure math; called from the
// receive transaction after stock movements have been queued.
//
// Formula: WAC_new = round((oldQty × oldWAC + Σ lineQty × lineUnitCost) / totalQty)
//
// Rules:
//   - If any incoming line has null unitCost, the caller must skip the update
//     entirely for that product (we cannot blend with unknown cost).
//   - If oldWAC is null or oldQty ≤ 0, we adopt the receipt-side average:
//     WAC_new = round(Σ lineQty × lineUnitCost / Σ lineQty).
//   - Rounding is half-away-from-zero (Math.round on non-negative values).

export type ReceiveLineForWac = {
  quantity: number;
  unitCost: number;
};

export function computeNewWac(
  oldQty: number,
  oldWac: number | null,
  lines: ReceiveLineForWac[],
): number {
  const receivedQty = lines.reduce((n, l) => n + l.quantity, 0);
  const receivedValue = lines.reduce((n, l) => n + l.quantity * l.unitCost, 0);
  if (receivedQty <= 0) {
    // Nothing received for this product — no update, but caller should not
    // reach here in practice.
    return oldWac ?? 0;
  }
  if (oldWac === null || oldQty <= 0) {
    return Math.round(receivedValue / receivedQty);
  }
  const totalQty = oldQty + receivedQty;
  const totalValue = oldQty * oldWac + receivedValue;
  return Math.round(totalValue / totalQty);
}
