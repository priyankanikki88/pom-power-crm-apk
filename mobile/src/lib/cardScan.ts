import TextRecognition from '@react-native-ml-kit/text-recognition';

export interface ScannedCard {
  name: string;
  company: string;
  phone: string;
  email: string;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?91[\s.-]?)?[6-9]\d{9}\b/;
const PHONE_LIKE_RE = /^\+?[\d\s().-]{7,}$/;
const URL_RE = /^(https?:\/\/|www\.)/i;
const COMPANY_HINT_RE = /\b(pvt|ltd|llp|inc|corp|industries|enterprises|company|solutions|technologies|power|energy|electric|electricals|group|systems)\b/i;

/**
 * On-device OCR (Google ML Kit, no network, no API key) on a visiting-card photo, then a best-effort guess at the lead
 * fields from the recognized text's line order — same as any card scanner, the user reviews and corrects before saving.
 */
export async function scanBusinessCard(uri: string): Promise<ScannedCard> {
  const result = await TextRecognition.recognize(uri);
  const lines = result.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const email = result.text.match(EMAIL_RE)?.[0] ?? '';
  const phoneMatch = result.text.match(PHONE_RE)?.[0] ?? '';
  const phone = phoneMatch.replace(/[\s.-]/g, '').replace(/^\+?91/, '');
  const candidates = lines.filter((l) => !EMAIL_RE.test(l) && !PHONE_LIKE_RE.test(l) && !URL_RE.test(l));
  const name = candidates[0] ?? '';
  const company = candidates.find((l) => l !== name && COMPANY_HINT_RE.test(l)) ?? candidates.find((l) => l !== name) ?? '';
  return { name, company, phone, email };
}
