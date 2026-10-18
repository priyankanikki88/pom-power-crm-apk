/** India's financial year: 1 Apr – 31 Mar. Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar (of startYear+1). */
export type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface Quarter {
  key: QuarterKey;
  label: string;
  /** "YYYY-MM-DD", inclusive. */
  from: string;
  to: string;
}

export interface FinancialYear {
  startYear: number;
  label: string;
  quarters: Quarter[];
}

const QUARTER_MONTHS: Record<QuarterKey, [number, number, number]> = {
  Q1: [4, 5, 6],
  Q2: [7, 8, 9],
  Q3: [10, 11, 12],
  Q4: [1, 2, 3],
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDayOfMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const monthShort = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });

function quarterOf(key: QuarterKey, startYear: number): Quarter {
  const months = QUARTER_MONTHS[key];
  const year = key === 'Q4' ? startYear + 1 : startYear;
  const lastMonth = months[2];
  const from = iso(year, months[0], 1);
  const to = iso(year, lastMonth, lastDayOfMonth(year, lastMonth));
  return { key, label: `${monthShort(year, months[0])} – ${monthShort(year, lastMonth)} ${year}`, from, to };
}

function buildFY(startYear: number): FinancialYear {
  return {
    startYear,
    label: `FY ${startYear}-${pad((startYear + 1) % 100)}`,
    quarters: (['Q1', 'Q2', 'Q3', 'Q4'] as const).map((k) => quarterOf(k, startYear)),
  };
}

export function financialYearOf(date: Date): FinancialYear {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return buildFY(m >= 4 ? y : y - 1);
}

/** Current FY first, then the ones before it. */
export function recentFinancialYears(count = 3, today = new Date()): FinancialYear[] {
  const current = financialYearOf(today);
  return Array.from({ length: count }, (_, i) => buildFY(current.startYear - i));
}

export function currentQuarterKey(today = new Date()): QuarterKey {
  const m = today.getMonth() + 1;
  if (m >= 4 && m <= 6) return 'Q1';
  if (m >= 7 && m <= 9) return 'Q2';
  if (m >= 10 && m <= 12) return 'Q3';
  return 'Q4';
}
