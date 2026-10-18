import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Quarter } from './financialYear';

/**
 * Figures for the Sales Person Dashboard, one quarter at a time. Quotation / Proforma / Format-4 / the monthly sales
 * chart / Targets all come from the same report engine the web CRM's own reports use (never computed here) and are
 * already scoped to the signed-in sales person by the backend. Leads has no backend date filter, so the quarter is
 * applied client-side over the (capped, max 2000) list the API already returns — flagged here, not hidden.
 * Customers and Follow-up Pending are live counts, not quarter figures (a "pending" follow-up or "my customer"
 * roster isn't something that resets each quarter) — and neither carries a money value in the data model at all,
 * so those two cards show a count only.
 */

const num = (v: unknown) => Number(v) || 0;
const IST = 'Asia/Kolkata';

interface ReportRow {
  [key: string]: unknown;
}
interface ReportResult {
  rows: ReportRow[];
}

export interface MonthPoint {
  label: string;
  value: number;
}

/** Monthly "actual revenue" (gross, finalized Format-4) for the 3 months of the quarter — the Total Sales bar chart. */
export function useQuarterSales(q: Quarter) {
  return useQuery({
    queryKey: ['sales-dashboard', 'chart', q.from, q.to],
    queryFn: async () => {
      const r = await api.get<ReportResult>('/reports/sales-by-period', { period: 'custom', from: q.from, to: q.to, granularity: 'month', tz: IST });
      const points: MonthPoint[] = r.rows.map((row) => ({ label: String(row.period ?? '').slice(0, 3), value: num(row.gross) }));
      return { points, total: points.reduce((s, p) => s + p.value, 0) };
    },
  });
}

export interface CountValue {
  count: number;
  value: number;
}

/** Quotation / Proforma / Format-4 pipeline count + value for the quarter, from the Sales Summary report. */
export function useQuarterDocuments(q: Quarter) {
  return useQuery({
    queryKey: ['sales-dashboard', 'summary', q.from, q.to],
    queryFn: async () => {
      const r = await api.get<ReportResult>('/reports/sales-summary', { period: 'custom', from: q.from, to: q.to, tz: IST });
      const pick = (measure: string): CountValue => {
        const row = r.rows.find((x) => x.measure === measure);
        return { count: num(row?.count), value: num(row?.value) };
      };
      return {
        quotations: pick('Quotation Pipeline'),
        proforma: pick('Proforma Pipeline'),
        format4: pick('Format-4 Value'),
      };
    },
  });
}

interface LeadRow {
  value: number;
  createdAt: string;
}

/** A lead's date in IST, for comparing against the quarter's own IST calendar dates. */
function istDay(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-CA', { timeZone: IST });
}

/** Leads created within the quarter — filtered client-side (see module note); capped at the 2000 the API itself returns. */
export function useQuarterLeads(q: Quarter) {
  return useQuery({
    queryKey: ['sales-dashboard', 'leads', q.from, q.to],
    queryFn: async () => {
      const r = await api.get<{ items: LeadRow[] }>('/leads');
      const items = r.items.filter((l) => {
        const d = istDay(l.createdAt);
        return d >= q.from && d <= q.to;
      });
      return { count: items.length, value: items.reduce((s, l) => s + num(l.value), 0) };
    },
  });
}

/** Live count of customers assigned to the signed-in sales person — not a quarter figure, and the Customer model has no deal value. */
export function useLiveCustomerCount() {
  return useQuery({
    queryKey: ['sales-dashboard', 'customers-count'],
    queryFn: async () => (await api.get<{ total: number }>('/customers', { page: 1, pageSize: 1 })).total,
  });
}

/** Live count of pending follow-ups — not a quarter figure, and a follow-up carries no money value in the data model. */
export function useLivePendingFollowUps() {
  return useQuery({
    queryKey: ['sales-dashboard', 'followups-pending'],
    queryFn: async () => (await api.get<{ total: number }>('/follow-ups', { view: 'pending', pageSize: 1 })).total,
  });
}

interface TargetRow {
  amount: number;
  achieved: number;
}

export interface TargetSummary {
  amount: number;
  achieved: number;
  pending: number;
  achievedPct: number | null;
  pendingPct: number | null;
}

/** Every target (of any metric) whose period overlaps the quarter, summed — the same live achievement the Targets screen shows. */
export function useQuarterTargets(q: Quarter) {
  return useQuery({
    queryKey: ['sales-dashboard', 'targets', q.from, q.to],
    queryFn: async (): Promise<TargetSummary> => {
      const rows = await api.get<TargetRow[]>('/targets', { from: q.from, to: q.to });
      const amount = round2(rows.reduce((s, t) => s + num(t.amount), 0));
      const achieved = round2(rows.reduce((s, t) => s + num(t.achieved), 0));
      const pending = Math.max(0, round2(amount - achieved));
      return {
        amount,
        achieved,
        pending,
        achievedPct: amount > 0 ? Math.round((achieved / amount) * 1000) / 10 : null,
        pendingPct: amount > 0 ? Math.round((pending / amount) * 1000) / 10 : null,
      };
    },
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
