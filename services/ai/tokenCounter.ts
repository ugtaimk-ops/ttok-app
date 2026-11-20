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
