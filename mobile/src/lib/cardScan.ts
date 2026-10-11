import TextRecognition from '@react-native-ml-kit/text-recognition';
import { boxFromFrame, parseLines, sortReadingOrder, type CardData, type OcrLine } from './cardParser';

export type { CardData } from './cardParser';
export { isCardEmpty } from './cardParser';

/** On-device OCR (Google ML Kit, no network, no API key) on a visiting-card photo, then the rule-based parser's best guess at its fields. */
export async function scanBusinessCard(uri: string): Promise<CardData> {
  const result = await TextRecognition.recognize(uri);
  const lines: OcrLine[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) lines.push({ text: line.text, box: boxFromFrame(line.frame) });
  }
  return parseLines(sortReadingOrder(lines));
}
