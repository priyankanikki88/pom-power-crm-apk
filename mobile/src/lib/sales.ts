import { isoDay } from './dates';

export type SalesType = 'PRODUCT' | 'AMC';
export type DocModule = 'quotation' | 'proforma' | 'format4';

/** The same list the server offers for an AMC (backend/src/commercial/amc-details.ts). */
export const AMC_TYPES = ['Comprehensive', 'Non-Comprehensive', 'Labour Only', 'Preventive Maintenance', 'Other'];

/**
 * Product documents need the document permission itself (quotation.manage, proforma.read, …); AMC documents need
 * amc.manage / amc.read instead — the server's rule, repeated here only to decide what to offer on screen.
 */
export function canFor(hasPermission: (code: string) => boolean, salesType: string | undefined, code: string): boolean {
  if (salesType !== 'AMC') return hasPermission(code);
  return hasPermission(code.endsWith('.manage') ? 'amc.manage' : 'amc.read');
}

/** The sales types the user may create for this kind of document. */
export function manageableTypes(hasPermission: (code: string) => boolean, module: DocModule): SalesType[] {
  return [...(hasPermission(`${module}.manage`) ? (['PRODUCT'] as const) : []), ...(hasPermission('amc.manage') ? (['AMC'] as const) : [])];
}

export interface AmcDraft {
  amcType: string;
  start: Date | null;
  end: Date | null;
  siteAddress: string;
  amcRemarks: string;
  amcTerms: string;
}
export const EMPTY_AMC: AmcDraft = { amcType: '', start: null, end: null, siteAddress: '', amcRemarks: '', amcTerms: '' };

/** The check the server makes too, done first so the user is told before anything is sent. */
export function amcDraftError(d: AmcDraft): string | null {
  if (!d.amcType) return 'Choose the AMC type.';
  if (!d.start || !d.end) return 'Choose the AMC start and end dates.';
  if (isoDay(d.end) < isoDay(d.start)) return 'The AMC end date must be on or after the start date.';
  return null;
}

/** One year less a day from the start — the usual AMC period, offered when the end date is still empty. */
export function oneYearFrom(start: Date): Date {
  const d = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  d.setDate(d.getDate() - 1);
  return d;
}

/** The AMC fields to send. Empty text is sent as "" so that editing can clear what was saved before. */
export function amcPayload(d: AmcDraft) {
  return { amcType: d.amcType, amcStartDate: d.start ? isoDay(d.start) : undefined, amcEndDate: d.end ? isoDay(d.end) : undefined, siteAddress: d.siteAddress.trim(), amcRemarks: d.amcRemarks.trim(), amcTerms: d.amcTerms.trim() };
}
