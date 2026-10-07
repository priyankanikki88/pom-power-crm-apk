/** Rupee formatting, same rules as the web CRM (frontend/src/lib/format.ts). */
export function formatINR(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "₹24.60 L" (lakh), "₹1.25 Cr" (crore); smaller amounts in full. */
export function formatINRCompact(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: abs >= 100 ? 0 : 2 })}`;
}

/** "ACTIVE_CUSTOMER" -> "Active Customer". */
export function enumLabel(v: string | null | undefined): string {
  if (!v) return '';
  return v
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}
