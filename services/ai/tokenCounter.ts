import type { GenerateContentOptions } from './types';

/** Developer API countTokens rejects config.systemInstruction. Include its
 * text in the counting contents only; generation keeps the real system role. */
export function tokenCountParts(options: GenerateContentOptions): any[] {
  const parts: any[] = [];
  if (options.systemInstruction) parts.push({ text: options.systemInstruction });
  parts.push({ text: options.prompt });
  if (options.imageBase64) parts.push({ inlineData: { mimeType: options.imageMimeType || 'image/jpeg', data: options.imageBase64 } });
  if (options.videoBase64) parts.push({ inlineData: { mimeType: options.videoMimeType || 'video/webm', data: options.videoBase64 } });
  return parts;
}

/** Count requests need the same key failover as generation, before any charge. */
export async function countWithKeyRotation<T>(
  keys: string[], start: number, count: (key: string) => Promise<T>,
  canRotate: (error: unknown) => boolean,
): Promise<{ result: T; keyIndex: number }> {
  if (!keys.length) throw new Error('Gemini credentials are not configured');
  let last: unknown;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = (start + attempt) % keys.length;
    try { return { result: await count(keys[keyIndex]), keyIndex }; }
    catch (error) { last = error; if (!canRotate(error)) throw error; }
  }
  throw last;
}
