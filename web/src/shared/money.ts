// Money is Int MRU (D-004). The shared formatter — used in receipts, tables,
// dashboards — always renders whole units with a thousands separator and the
// currency suffix.

// Arabic-Indic → European digits, so a user typing ٠١٢ still gets parsed as 012.
const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => ARABIC_DIGITS[d] ?? d);
}

export function formatMoney(value: number | null | undefined, currency = 'MRU'): string {
  if (value === null || value === undefined) return '—';
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)} ${currency}`;
}

export function parseMoneyInput(input: string): number | null {
  const stripped = normalizeDigits(input).replace(/[\s,]/g, '');
  if (stripped === '') return null;
  if (!/^-?\d+$/.test(stripped)) return NaN;
  return parseInt(stripped, 10);
}
