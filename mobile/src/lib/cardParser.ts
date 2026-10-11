/**
 * Turns the OCR text of one visiting card into contact fields. Rule-based and fully offline — a faithful TypeScript
 * port of a dedicated Android card-scanner app's parser (same regex rules, tested against real Indian visiting
 * cards). Steps: emails, websites and phone numbers are pulled out with patterns; address lines are found by
 * keywords, PIN codes and city/state names; the rest is split into parts and classified as designation, company or
 * name. The result is a best guess — the caller always shows it to the user for review before saving.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerY: number;
}
export interface OcrLine {
  text: string;
  box?: Box;
}
export interface CardData {
  name: string;
  designation: string;
  company: string;
  phones: string[];
  emails: string[];
  website: string;
  address: string;
}
type Role = 'NONE' | 'DESIGNATION' | 'COMPANY' | 'NAME' | 'MERGED';
interface LineRec {
  index: number;
  text: string;
  height: number;
  continues: boolean;
}
interface Part {
  index: number;
  text: string;
  height: number;
  role: Role;
}

export function isCardEmpty(c: CardData): boolean {
  return !c.name && !c.company && c.phones.length === 0 && c.emails.length === 0 && !c.website && !c.address;
}

export function boxFromFrame(frame?: { left: number; top: number; width: number; height: number }): Box | undefined {
  if (!frame) return undefined;
  const { left, top, width, height } = frame;
  return { left, top, right: left + width, bottom: top + height, width, height, centerY: top + height / 2 };
}

/** Median line height, used to tell "big print" (a company name, a title) from the rest; 0 when no position data. */
function medianHeight(lines: OcrLine[]): number {
  const heights = lines
    .map((l) => l.box?.height)
    .filter((h): h is number => typeof h === 'number' && h > 0)
    .sort((a, b) => a - b);
  return heights.length === 0 ? 0 : heights[Math.floor(heights.length / 2)];
}

/** Sorts lines top-to-bottom, then left-to-right for lines on the same row. Left as-is when no position data. */
export function sortReadingOrder(lines: OcrLine[]): OcrLine[] {
  if (lines.some((l) => !l.box)) return lines;
  const rowTolerance = Math.max(1, Math.floor(medianHeight(lines) / 2));
  const sorted = [...lines].sort((a, b) => a.box!.centerY - b.box!.centerY);
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    if (row && line.box!.centerY - row[0].box!.centerY <= rowTolerance) row.push(line);
    else rows.push([line]);
  }
  return rows.flatMap((row) => [...row].sort((a, b) => a.box!.left - b.box!.left));
}

export function parse(text: string): CardData {
  return parseLines(text.split('\n').map((t) => ({ text: t })));
}

export function parseLines(input: OcrLine[]): CardData {
  const lines = input.map((l) => ({ ...l, text: clean(l.text) })).filter((l) => l.text.length > 0);
  const medianH = medianHeight(lines);

  const emails = new Set<string>();
  const phones: string[] = [];
  let website = '';
  const rest: LineRec[] = [];
  const phoneLines = new Set<number>();

  lines.forEach((line, index) => {
    let text = line.text;
    let found = false;

    const emailText = text.replace(new RegExp(SPACE_AROUND_AT, 'g'), '@');
    const emailMatches = [...emailText.matchAll(new RegExp(EMAIL, 'gi'))];
    if (emailMatches.length > 0) {
      for (const mm of emailMatches) emails.add(mm[0].toLowerCase().replace(/\.+$/, ''));
      text = emailText.replace(new RegExp(EMAIL, 'gi'), ' ');
      found = true;
    }

    const webMatch = text.match(new RegExp(WEBSITE, 'i'));
    if (webMatch && webMatch.index !== undefined) {
      if (!website) website = normalizeWebsite(webMatch[0]);
      text = text.slice(0, webMatch.index) + ' ' + text.slice(webMatch.index + webMatch[0].length);
      found = true;
    }

    const phoneResult = extractPhones(text);
    if (phoneResult.found) {
      phoneLines.add(index);
      phones.push(...phoneResult.phones);
      text = phoneResult.rest;
      found = true;
    }

    if (found) text = stripLabels(text);
    const continues = text.trimEnd().endsWith(',');
    text = trimChars(text).replace(/\s+/g, ' ');
    if (countLetters(text) >= 2) rest.push({ index, text, height: line.box?.height ?? 0, continues });
  });

  // --- address ---
  const scores = new Map<number, number>();
  for (const l of rest) scores.set(l.index, addressScore(l.text, l.continues));
  const addressIdx = new Set<number>();
  for (const l of rest) if ((scores.get(l.index) ?? 0) >= 2) addressIdx.add(l.index);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of rest) {
      if (!addressIdx.has(l.index) && (scores.get(l.index) ?? 0) >= 1 && (addressIdx.has(l.index - 1) || addressIdx.has(l.index + 1))) {
        addressIdx.add(l.index);
        grew = true;
      }
    }
  }
  const address = trimChars(
    rest
      .filter((l) => addressIdx.has(l.index))
      .map((l) => trimChars(l.text.replace(new RegExp(ADDRESS_LABEL, 'i'), '')))
      .join(', ')
      .replace(new RegExp(REPEATED_COMMAS, 'g'), ', '),
  );

  // --- designation / company / name ---
  const parts: Part[] = [];
  for (const l of rest) {
    if (addressIdx.has(l.index)) continue;
    const pieces = l.text
      .split(new RegExp(SEPARATORS))
      .map((p) => trimChars(p))
      .filter((p) => countLetters(p) >= 2);
    for (const p of pieces) parts.push({ index: l.index, text: p, height: l.height, role: 'NONE' });
  }
  for (const p of parts) {
    const des = new RegExp(DESIGNATION, 'i').test(p.text) && wordCount(p.text) <= 7;
    const com = new RegExp(COMPANY, 'i').test(p.text);
    if (des && com) p.role = new RegExp(LEGAL, 'i').test(p.text) ? 'COMPANY' : 'DESIGNATION';
    else if (des) p.role = 'DESIGNATION';
    else if (com) p.role = 'COMPANY';
  }

  let designation = '';
  const desPart = parts.find((p) => p.role === 'DESIGNATION');
  const desLine = desPart ? desPart.index : null;
  if (desLine !== null) {
    const onLine = parts.filter((p) => p.index === desLine);
    designation = onLine.every((p) => p.role === 'DESIGNATION')
      ? rest.find((l) => l.index === desLine)!.text
      : onLine
          .filter((p) => p.role === 'DESIGNATION')
          .map((p) => p.text)
          .join(', ');
    if (designation.startsWith('(') && designation.endsWith(')')) designation = designation.slice(1, -1).trim();
  }

  // "DNA" + "TECHNOLOGIES", "Guru Nanak" + "Solar": a one-word company line joins the line above it.
  for (const p of parts.filter((x) => x.role === 'COMPANY' && wordCount(x.text) === 1)) {
    const aboveMatches = parts.filter((x) => x.index === p.index - 1);
    const above = aboveMatches[aboveMatches.length - 1];
    if (!above) continue;
    const sameLine = parts.filter((x) => x.index === above.index).length === 1;
    const similar = medianH === 0 || above.height === 0 || Math.max(above.height, p.height) <= Math.min(above.height, p.height) * 1.6;
    if (above.role === 'NONE' && sameLine && similar && wordCount(above.text) <= 3 && !/\d/.test(above.text) && !new RegExp(HONORIFIC, 'i').test(above.text)) {
      p.text = `${above.text} ${p.text}`;
      above.role = 'MERGED';
    }
  }

  let companyPart: Part | undefined;
  let bestCompanyScore = -Infinity;
  for (const p of parts) {
    if (p.role !== 'COMPANY') continue;
    const s = companyScore(p, medianH);
    if (s > bestCompanyScore) {
      bestCompanyScore = s;
      companyPart = p;
    }
  }

  const firstEmail = [...emails][0];
  const emailLocal = firstEmail ? firstEmail.split('@')[0].replace(/[^A-Za-z]/g, '') : '';
  let namePart: Part | undefined;
  let bestNameScore = -Infinity;
  for (const p of parts) {
    if (p.role !== 'NONE' || !looksLikeName(p.text)) continue;
    const s = nameScore(p, emailLocal, desLine, phoneLines, medianH);
    if (s < 0) continue;
    if (s > bestNameScore) {
      bestNameScore = s;
      namePart = p;
    }
  }
  if (namePart) namePart.role = 'NAME';

  let company = companyPart ? companyPart.text : '';
  if (!company) {
    const others = parts.filter((p) => p.role === 'NONE' && wordCount(p.text) <= 6 && !new RegExp(FILLER, 'i').test(p.text));
    const sld = companyDomain(website, emails);
    let chosen: Part | undefined;
    if (sld) chosen = others.find((p) => matchesDomain(p.text, sld));
    if (!chosen) {
      let bestH = -Infinity;
      for (const p of others) {
        if (medianH > 0 && p.height >= medianH * 1.15 && p.height > bestH) {
          bestH = p.height;
          chosen = p;
        }
      }
    }
    if (!chosen) chosen = others.find((p) => !new RegExp(NOT_NAME, 'i').test(p.text));
    company = chosen ? chosen.text : '';
  }

  return {
    name: namePart ? tidyName(namePart.text) : '',
    designation,
    company,
    phones,
    emails: [...emails],
    website,
    address,
  };
}

// ---------------------------------------------------------------- helpers

function clean(s: string): string {
  return s.replace(/[\u2019\u2018]/g, "'").replace(/\s+/g, ' ').trim();
}
function countLetters(s: string): number {
  return (s.match(/[A-Za-z]/g) ?? []).length;
}
function wordCount(s: string): number {
  return s.split(' ').filter((w) => /[A-Za-z]/.test(w)).length;
}
const TRIM_CHAR_SET = " ,|-:;/.\u2022\u00b7\u2013\u2014";
function trimChars(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && TRIM_CHAR_SET.includes(s[start])) start++;
  while (end > start && TRIM_CHAR_SET.includes(s[end - 1])) end--;
  return s.slice(start, end);
}
function substringAfter(s: string, sep: string): string {
  const i = s.indexOf(sep);
  return i === -1 ? s : s.slice(i + sep.length);
}
function substringBefore(s: string, sep: string): string {
  const i = s.indexOf(sep);
  return i === -1 ? s : s.slice(0, i);
}

interface PhoneResult {
  phones: string[];
  rest: string;
  found: boolean;
}
function extractPhones(text: string): PhoneResult {
  const phones: string[] = [];
  let found = false;
  const rest = text.replace(new RegExp(PHONE_CANDIDATE, 'g'), (match: string, offset: number) => {
    if ((match.match(/\d/g) ?? []).length < 8) return match;
    const before = text.substring(0, offset);
    const lastWordMatch = before.match(new RegExp(LAST_WORD, 'i'));
    const isFax = !!lastWordMatch && lastWordMatch[0].toLowerCase() === 'fax' && !new RegExp(TEL_FAX, 'i').test(before);
    let leftovers = ' ';
    for (const piece of splitMerged(match)) {
      const phone = normalizePhone(piece);
      if (phone === null) leftovers += piece + ' ';
      else {
        found = true;
        if (!isFax) phones.push(phone);
      }
    }
    return leftovers;
  });
  return { phones, rest, found };
}

/** "110001 98765 43210" -> ["110001", "98765 43210"]; "98765 43210 91234 56789" -> two numbers. */
function splitMerged(candidate: string): string[] {
  const out: string[] = [];
  let acc = '';
  let accDigits = 0;
  for (const token of candidate.trim().split(/\s+/)) {
    const d = (token.match(/\d/g) ?? []).length;
    if (acc.length > 0 && (accDigits >= 10 || accDigits + d > 13)) {
      out.push(acc);
      acc = '';
      accDigits = 0;
    }
    acc = acc.length === 0 ? token : `${acc} ${token}`;
    accDigits += d;
  }
  if (acc.length > 0) out.push(acc);
  return out;
}

/** Indian numbers get +91; others keep their digits (and a leading + if printed). */
function normalizePhone(raw: string): string | null {
  const plus = raw.trim().startsWith('+');
  const d = raw.replace(/\D/g, '');
  if (d.length < 8 || d.length > 13) return null;
  if (plus) return `+${d}`;
  if (d.length === 10 && d[0] >= '6' && d[0] <= '9') return `+91${d}`;
  if (d.length === 12 && d.startsWith('91') && d[2] >= '6' && d[2] <= '9') return `+${d}`;
  if (d.length === 11 && d[0] === '0' && d[1] >= '6' && d[1] <= '9') return `+91${d.slice(1)}`;
  return d;
}

function normalizeWebsite(raw: string): string {
  let s = raw;
  while (s.length > 0 && '.,/;'.includes(s[s.length - 1])) s = s.slice(0, -1);
  return s.toLowerCase();
}

function stripLabels(text: string): string {
  return text.replace(new RegExp(LONG_LABELS, 'gi'), ' ').replace(new RegExp(SHORT_LABELS, 'gi'), ' ');
}

function addressScore(text: string, continues: boolean): number {
  const hasDigit = /\d/.test(text);
  if (new RegExp(DESIGNATION, 'i').test(text) && !hasDigit) return 0;
  if (new RegExp(LEGAL, 'i').test(text) && !hasDigit) return 0;
  let score = [...text.matchAll(new RegExp(ADDRESS_WORDS, 'gi'))].length;
  if (new RegExp(PINCODE).test(text)) score += 2;
  if (new RegExp(ADDRESS_LABEL, 'i').test(text)) score += 2;
  if (new RegExp(PLACES, 'i').test(text) || new RegExp(STATE_ABBR, 'i').test(text)) score += 1;
  if (continues) score += 1;
  if (score > 0 && hasDigit) score += 1;
  if (score > 0 && text.includes(',')) score += 1;
  return score;
}

function looksLikeName(text: string): boolean {
  if (!new RegExp(NAME_SHAPE).test(text)) return false;
  const words = text.split(' ').filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 1 || words.length > 4 || words.some((w) => w.length > 20)) return false;
  if (countLetters(text) < 3) return false;
  return !new RegExp(NOT_NAME, 'i').test(text);
}

function nameScore(p: Part, emailLocal: string, desLine: number | null, phoneLines: Set<number>, medianH: number): number {
  const words = p.text.split(' ').filter((w) => /[A-Za-z]/.test(w));
  let s = words.length === 2 || words.length === 3 ? 2.0 : words.length === 4 ? 1.0 : -1.5;
  if ([...phoneLines].some((i) => Math.abs(i - p.index) <= 2)) s += 1;
  if (
    emailLocal.length >= 3 &&
    words.some((w) => {
      const lw = w.toLowerCase().replace(/[^a-z]/g, '');
      return lw.length >= 3 && emailLocal.toLowerCase().includes(lw);
    })
  )
    s += 3;
  if (desLine !== null && Math.abs(p.index - desLine) <= 1) s += 2;
  if (new RegExp(HONORIFIC, 'i').test(p.text)) s += 2;
  if (medianH > 0 && p.height >= medianH * 1.15) s += 1;
  if (words.length > 0 && words.every((w) => /^[A-Z]/.test(w))) s += 1;
  return s - p.index * 0.05;
}

/** Legal words and bigger print win; taglines ("... with the future ...") lose. */
function companyScore(p: Part, medianH: number): number {
  let s = 0;
  if (new RegExp(LEGAL, 'i').test(p.text)) s += 4;
  if (new RegExp(STRONG_COMPANY, 'i').test(p.text)) s += 2;
  if (medianH > 0 && p.height > 0) s += Math.min(p.height / medianH, 3.0) * 1.5;
  if (new RegExp(FILLER, 'i').test(p.text)) s -= 3;
  if (/[\d(]/.test(p.text)) s -= 2;
  s -= Math.max(0, wordCount(p.text) - 4) * 0.5;
  return s - p.index * 0.05;
}

function tidyName(name: string): string {
  if (/[A-Za-z]/.test(name) && name === name.toUpperCase() && name.length > 3) {
    return name
      .toLowerCase()
      .split(' ')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }
  return name;
}

function companyDomain(website: string, emails: Set<string>): string | null {
  const hosts: string[] = [];
  if (website) {
    let h = substringAfter(website, '://');
    if (h.startsWith('www.')) h = h.slice(4);
    hosts.push(substringBefore(h, '/'));
  }
  for (const e of emails) {
    const host = substringAfter(e, '@');
    const sld = substringBefore(host, '.');
    if (!FREE_MAIL.has(sld)) hosts.push(host);
  }
  const first = hosts[0];
  if (!first) return null;
  const domain = substringBefore(first, '.').replace(/[^A-Za-z0-9]/g, '');
  return domain.length >= 3 ? domain : null;
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
function matchesDomain(text: string, domain: string): boolean {
  const compact = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compact.length < 3) return false;
  if (domain.includes(compact) || compact.includes(domain)) return true;
  return commonPrefixLength(compact, domain) >= 5;
}

// ---------------------------------------------------------------- patterns

const SPACE_AROUND_AT = '\\s*@\\s*';
const EMAIL = '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}';
const WEBSITE = '\\b(https?://)?(www\\.)?[a-z0-9][a-z0-9-]*(\\.[a-z0-9-]+)*\\.(com|in|co\\.in|net|org|org\\.in|biz|info|io|co|shop|store|online|tech|app|ai|ae)\\b(/\\S*)?';
const PHONE_CANDIDATE = '\\+?\\(?\\d[\\d\\s\\-().]{6,}\\d';
const LAST_WORD = '[A-Za-z]+(?=[^A-Za-z]*$)';
const TEL_FAX = '(tel|ph|phone)\\s*/\\s*fax';
const LONG_LABELS = '(?<![a-z])(mobile|mob|phone|ph|telephone|tel|cell|office|off|residence|res|whats\\s?app|wa|e-?mail|mail|website|web|url|fax|contact|call|toll\\s?free|helpline|landline|hp)(?![a-z])\\.?\\s*(no\\.?)?\\s*[:\\-]?';
const SHORT_LABELS = '(?<![a-z])[mtewopf]\\s*[:\\-]';

const SEPARATORS = '\\s*[|\u2022\u00b7,]\\s*|\\s+[-\u2013\u2014]\\s+';
const NAME_SHAPE = "^[A-Za-z][A-Za-z.'\\- ]*$";
const HONORIFIC = '^(dr|mr|mrs|ms|er|adv|ca|prof|shri|smt)\\.?\\s';
const NOT_NAME =
  '\\b(thank|thanks|welcome|since|contact|call|visit|us|our|the|and|of|for|with|best|quality|' +
  'service|services|dealer|dealers|deals|all|kinds|specialist|india|distributor|distributors|authorised|' +
  'authorized|experts?|online|ups|servo|panels?|inverters?|invertors?|battery|controllers?|drives|lights|' +
  'led|camera|digital|machine|cutting|laser|grid|hybrid|heating|water|geysers?|development|epc|charging|' +
  'station|modules|park|rooftop|roof|lithium|pack|manufacturer|assembly|integrator|provider|turnkey|' +
  'sales|center|centre|computer|safe|brands|approved|positive|energies|accessories|swimming|parts|' +
  'vehicles|lighting|scan|details|more|partner|iso|gstin|toll|free|kva|ev|bess)\\b';
const FREE_MAIL = new Set(['gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook', 'live', 'msn', 'rediffmail', 'rediff', 'icloud', 'me', 'aol', 'protonmail', 'proton', 'zoho', 'mail']);

function words(...w: string[]): string {
  return `\\b(${w.join('|')})\\b`;
}

const DESIGNATION = words(
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'founder', 'co-founder', 'cofounder', 'director', 'md', 'manager',
  'gm', 'agm', 'dgm', 'proprietor', 'proprietress', 'prop', 'owner', 'partner', 'chairman', 'chairperson',
  'president', 'vice president', 'vp', 'head', 'lead', 'executive', 'officer', 'engineer', 'consultant',
  'advisor', 'adviser', 'associate', 'analyst', 'developer', 'designer', 'architect', 'accountant',
  'chartered accountant', 'advocate', 'lawyer', 'attorney', 'doctor', 'physician', 'surgeon', 'dentist',
  'secretary', 'supervisor', 'coordinator', 'co-ordinator', 'representative', 'specialist', 'administrator',
  'trainee', 'intern', 'principal', 'professor', 'lecturer', 'teacher', 'incharge', 'in-charge', 'recruiter',
  'agent', 'contractor', 'technician', 'photographer', 'chef', 'trainer', 'coach', 'therapist', 'pharmacist',
  'auditor', 'mbbs',
);
const LEGAL = '\\b(pvt|private|ltd|limited|llp|inc|corp|corporation)\\b|&\\s*co\\b';
const COMPANY =
  LEGAL +
  '|' +
  words(
    'company', 'enterprises', 'enterprise', 'industries', 'traders', 'trading', 'solutions', 'technologies',
    'technology', 'infotech', 'tech', 'services', 'associates', 'group', 'agency', 'agencies', 'consultants',
    'consultancy', 'systems', 'international', 'exports', 'imports', 'impex', 'overseas', 'pharma',
    'pharmaceuticals', 'foods', 'labs', 'laboratories', 'studio', 'studios', 'software', 'softwares',
    'ventures', 'holdings', 'logistics', 'builders', 'developers', 'constructions', 'construction', 'motors',
    'electronics', 'electricals', 'textiles', 'fabrics', 'garments', 'jewellers', 'jewelers', 'stores',
    'store', 'mart', 'emporium', 'restaurant', 'hotel', 'hotels', 'cafe', 'bakery', 'sweets', 'academy',
    'institute', 'school', 'college', 'university', 'foundation', 'trust', 'bank', 'finance', 'finserv',
    'capital', 'insurance', 'realty', 'realtors', 'properties', 'infra', 'infrastructure', 'media',
    'communications', 'networks', 'digital', 'printers', 'prints', 'packaging', 'plastics', 'steel',
    'metals', 'chemicals', 'polymers', 'automobiles', 'travels', 'tours', 'events', 'interiors', 'furniture',
    'fashion', 'boutique', 'salon', 'clinic', 'hospital', 'hospitals', 'diagnostics', 'cleaners', 'laundry',
    'sons', 'brothers', 'bros', 'solar', 'energy', 'power', 'electrical', 'electric', 'engineering',
    'engineers', 'automation', 'house', 'pool', 'batteries', 'motors',
  );
const STRONG_COMPANY = words(
  'enterprises', 'enterprise', 'industries', 'traders', 'trading', 'solutions', 'technologies', 'infotech',
  'services', 'associates', 'group', 'agency', 'agencies', 'consultants', 'systems', 'international',
  'exports', 'impex', 'overseas', 'ventures', 'holdings', 'electricals', 'electronics', 'labs', 'studio',
  'hospital', 'clinic', 'academy', 'institute', 'brothers',
);
/** Words of slogans and product lists, never a person's name or a company name. */
const FILLER = words('with', 'the', 'of', 'for', 'in', 'to', 'your', 'our', 'we', 'is', 'are', 'all', 'types', 'deals', 'deal', 'future', 'tomorrow', 'mind', 'get', 'let', 'flow', 'one', 'and');
const ADDRESS_WORDS = words(
  'road', 'rd', 'street', 'st', 'marg', 'nagar', 'colony', 'sector', 'sec', 'phase', 'block', 'floor', 'flr',
  'plot', 'shop', 'office no', 'building', 'bldg', 'tower', 'towers', 'complex', 'plaza', 'market', 'mall',
  'lane', 'gali', 'chowk', 'near', 'opp', 'opposite', 'behind', 'cross', 'layout', 'extension', 'extn',
  'park', 'vihar', 'enclave', 'puram', 'bagh', 'ganj', 'bazar', 'bazaar', 'apartment', 'apartments', 'apt',
  'flat', 'house no', 'h\\.? ?no', 'village', 'vill', 'tehsil', 'dist', 'district', 'taluka', 'pin',
  'pincode', 'zip', 'highway', 'nh', 'bypass', 'midc', 'gidc', 'industrial area', 'circle', 'junction',
  'mohalla', 'ward', 'station', 'p\\.?o',
);
const PLACES = words(
  'india', 'delhi', 'new delhi', 'mumbai', 'bombay', 'bangalore', 'bengaluru', 'chennai', 'madras', 'kolkata',
  'calcutta', 'hyderabad', 'secunderabad', 'pune', 'ahmedabad', 'jaipur', 'lucknow', 'noida', 'greater noida',
  'gurgaon', 'gurugram', 'ghaziabad', 'faridabad', 'chandigarh', 'mohali', 'indore', 'bhopal', 'patna',
  'surat', 'nagpur', 'kanpur', 'vadodara', 'baroda', 'ludhiana', 'agra', 'nashik', 'coimbatore', 'kochi',
  'cochin', 'thane', 'navi mumbai', 'visakhapatnam', 'vizag', 'bhubaneswar', 'dehradun', 'ranchi', 'raipur',
  'guwahati', 'varanasi', 'meerut', 'amritsar', 'jodhpur', 'udaipur', 'rajkot', 'madurai', 'mysore',
  'mysuru', 'trivandrum', 'thiruvananthapuram', 'uttar pradesh', 'maharashtra', 'karnataka', 'tamil nadu',
  'gujarat', 'rajasthan', 'west bengal', 'bihar', 'madhya pradesh', 'telangana', 'andhra pradesh', 'kerala',
  'punjab', 'haryana', 'odisha', 'orissa', 'jharkhand', 'assam', 'uttarakhand', 'himachal pradesh', 'goa',
  'chhattisgarh', 'jammu', 'kashmir',
);
const STATE_ABBR = '\\((u\\.?\\s?p|m\\.?\\s?p|h\\.?\\s?p|raj|gsp|w\\.?\\s?b)\\.?\\)';
const PINCODE = '(?<!\\d)[1-9]\\d{2}\\s?\\d{3}(?!\\d)';
const ADDRESS_LABEL = '^(address|addr|add|regd\\.?\\s*off(ice)?|corp\\.?\\s*off(ice)?|head\\s*off(ice)?|branch(\\s*off(ice)?)?|b\\.\\s?o|office|works|factory)\\.?\\s*[:\\-]\\s*';
const REPEATED_COMMAS = '\\s*,\\s*(,\\s*)*';
