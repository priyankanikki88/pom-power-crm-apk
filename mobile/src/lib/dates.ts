/** The CRM plans and reports on India's calendar, whatever the phone's own time zone is set to. */
const IST = 'Asia/Kolkata';

/** "Mon, 05 Oct, 10:30 am" */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: IST });
}

/** "05 Oct 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The date ("YYYY-MM-DD") and time ("HH:mm") the user picked, read off the picker's own clock face — the server treats them as India time. */
export function pickedParts(d: Date): { date: string; time: string } {
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** "YYYY-MM-DD" as shown on the phone's own calendar — what a date-only field sends. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A saved date ("2026-10-05" or "2026-10-05T00:00:00.000Z") as a Date the picker shows on that same calendar day. */
export function dayFromIso(iso: string | null | undefined): Date | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Next whole hour, at least an hour away — a sensible default for "plan a follow-up". */
export function nextHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  return d;
}
