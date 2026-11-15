import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { getAdminFirestore } from './usageService';
import { ROOM_ACTIONS } from './sharedRoomsService';

// Mirrors ddok-shared/functions/src/personal.ts and validation.ts for the
// supported personal actions. Keep this adapter in sync with that contract.
type Data = Record<string, unknown>;
type Db = ReturnType<typeof getAdminFirestore>;
const nodeRequire = createRequire(process.cwd() + '/package.json');
export class StudyError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
const bad = (message: string): never => { throw new StudyError('INVALID_ARGUMENT', message); };
const obj = (v: unknown): Data => v && typeof v === 'object' && !Array.isArray(v) ? v as Data : bad('Expected object');
const str = (v: unknown, name: string, max = 120): string =>
  typeof v === 'string' && !!v.trim() && v.length <= max ? v.trim() : bad(name);
const id = (v: unknown): string => { const s = str(v, 'id', 128); return /^[A-Za-z0-9_-]+$/.test(s) ? s : bad('Invalid id'); };
const integer = (v: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : bad(name);
const choice = <T extends string>(v: unknown, options: readonly T[]): T =>
  options.includes(v as T) ? v as T : bad('Invalid enum');
const canonical = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
  v && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}' : JSON.stringify(v);
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const dayKey = (ms: number) => new Date(ms + 32400000).toISOString().slice(0, 10);

export function sessionInput(d: Data, now: number) {
  const startedAtMs = integer(d.startedAtMs, 'startedAtMs', 1, now);
  const endedAtMs = integer(d.endedAtMs, 'endedAtMs', startedAtMs + 1, now);
  if (endedAtMs - startedAtMs > 86400000) bad('Session exceeds 24 hours');
  const rawIntervals = d.intervals;
  if (!Array.isArray(rawIntervals) || rawIntervals.length < 1 || rawIntervals.length > 200) bad('intervals');
  let previous = startedAtMs, total = 0;
  const intervals = (rawIntervals as unknown[]).map((v: unknown) => {
    const p = obj(v);
    const start = integer(p.start, 'start', previous, endedAtMs - 1);
    const end = integer(p.end, 'end', start + 1, endedAtMs);
    previous = end; total += end - start;
    return { start, end };
  });
  const focusSeconds = integer(d.focusSeconds, 'focusSeconds', 1, 86400);
  if (Math.floor(total / 1000) !== focusSeconds) bad('focusSeconds must equal actual intervals');
  if (d.goalId != null) id(d.goalId);
  return {
    // Goals stay local to each app. Validate legacy queued IDs, then omit them
    // from the shared record so old offline sessions can still be uploaded.
    id: id(d.id), goalId: null,
    subject: str(d.subject, 'subject'), timerMode: str(d.timerMode, 'timerMode', 40),
    startedAtMs, endedAtMs, focusSeconds, intervals,
    sourceApp: choice(d.sourceApp, ['ddok', 'timer'] as const),
  };
}
export function dailyParts(intervals: { start: number; end: number }[]): Record<string, number> {
  const ms: Record<string, number> = {};
  for (const i of intervals) {
    let p = i.start;
    while (p < i.end) {
      const boundary = (Math.floor((p + 32400000) / 86400000) + 1) * 86400000 - 32400000;
      const end = Math.min(boundary, i.end), day = dayKey(p);
      ms[day] = (ms[day] ?? 0) + end - p; p = end;
    }
  }
  const result: Record<string, number> = {}; let remainder = 0;
  for (const day of Object.keys(ms).sort()) {
    const n = ms[day]! + remainder;
    result[day] = Math.floor(n / 1000); remainder = n % 1000;
  }
  return result;
}
export function hourlyParts(intervals: { start: number; end: number }[]): Record<string, Record<string, number>> {
  const ms: Record<string, number> = {};
  for (const i of intervals) {
    let p = i.start;
    while (p < i.end) {
      const end = Math.min(i.end, (Math.floor((p + 32400000) / 3600000) + 1) * 3600000 - 32400000);
      const hour = new Date(p + 32400000).toISOString().slice(0, 13);
      ms[hour] = (ms[hour] ?? 0) + end - p; p = end;
    }
  }
  const result: Record<string, Record<string, number>> = {}; let remainder = 0;
  for (const key of Object.keys(ms).sort()) {
    const day = key.slice(0, 10), hour = String(Number(key.slice(11, 13)));
    const n = ms[key]! + remainder;
    (result[day] ??= {})[hour] = Math.floor(n / 1000); remainder = n % 1000;
  }
  return result;
}
export const ACTIONS = new Set(['registerApp', 'upsertExam', 'deleteExam', 'saveSession', 'saveJournal', 'deleteJournal']);
export const COLLECTIONS = new Set(['exams', 'studySessions', 'dailyStats', 'studyJournal']);

export async function assertSharedStudyAccount(uid: string, authorization: string | undefined) {
  // The server's /api middleware has already verified this Firebase ID token's
  // signature, issuer, audience, expiry, and uid.
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new StudyError('AUTH_REQUIRED', 'Sign in required', 401);
  getAdminFirestore();
  const { getApps } = nodeRequire('firebase-admin/app');
  const { getAuth } = nodeRequire('firebase-admin/auth');
  const record = await getAuth(getApps()[0]).getUser(uid);
  const claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8')) as Data;
  const firebase = obj(claims.firebase);
  const provider = firebase.sign_in_provider;
  const trusted = !record.disabled && (
    provider === 'password' ? record.emailVerified && claims.email_verified === true :
    provider === 'google.com' || provider === 'apple.com'
      ? record.providerData.some((p: {providerId: string}) => p.providerId === provider) :
    provider === 'custom' && claims.ddokTimer === true &&
      (record.emailVerified || record.providerData.some((p: {providerId: string}) =>
        p.providerId === 'google.com' || p.providerId === 'apple.com'))
  );
  if (!trusted || (record.tokensValidAfterTime && Number(claims.auth_time) * 1000 < new Date(record.tokensValidAfterTime).getTime()))
    throw new StudyError('AUTH_REQUIRED', 'Sign in again with a trusted account', 401);
}

export function parseAction(body: unknown, uid: string) {
  const d = obj(body);
  if (d.expectedUid !== uid) throw new StudyError('IDENTITY_MISMATCH', 'expectedUid does not match authenticated user', 403);
  const action = str(d.action, 'action', 40);
  if (!ACTIONS.has(action) && !ROOM_ACTIONS.has(action)) bad('Unknown action');
  const payload = d.payload === undefined ? {} : obj(d.payload);
  if (payload.expectedUid !== undefined && payload.expectedUid !== uid)
    throw new StudyError('IDENTITY_MISMATCH', 'expectedUid does not match authenticated user', 403);
  return { action, payload };
}

export function createSharedStudyPersonal(db: Db, now = () => Date.now()) {
  const { Timestamp, FieldValue } = nodeRequire('firebase-admin/firestore');
  const user = (uid: string) => db.collection('users').doc(uid);
  const stamp = () => ({ schemaVersion: 1, updatedAt: Timestamp.now() });
  const active = async (tx: any, uid: string) => {
    const [profile, tombstone] = await Promise.all([
      tx.get(user(uid)), tx.get(db.collection('deletedAccounts').doc(uid)),
    ]);
    if (tombstone.exists || profile.get('studyDeleting') === true)
      throw new StudyError('ACCOUNT_DELETED', 'Account deletion pending', 403);
    return profile;
  };
  return {
    async read(uid: string, name: string) {
      if (!COLLECTIONS.has(name)) bad('Unknown collection');
      const ref = user(uid);
      const [profile, tombstone] = await Promise.all([ref.get(), db.collection('deletedAccounts').doc(uid).get()]);
      if (tombstone.exists || profile.get('studyDeleting') === true)
        throw new StudyError('ACCOUNT_DELETED', 'Account deletion pending', 403);
      const orderField = name === 'dailyStats' ? 'dateKey' : name === 'studySessions' ? 'createdAt' : 'updatedAt';
      const pageSize = name === 'dailyStats' ? 400 : 200;
      const snapshot = await ref.collection(name).orderBy(orderField, 'desc').limit(pageSize + 1).get();
      return { items: snapshot.docs.slice(0, pageSize).map((doc: any) => ({ ...doc.data(), id: doc.id })), hasMore: snapshot.size > pageSize };
    },
    async action(uid: string, action: string, d: Data) {
      if (!ACTIONS.has(action)) bad('Unknown action');
      if (action === 'registerApp') {
        const source = choice(d.sourceApp, ['timer', 'ddok'] as const);
        await db.runTransaction(async (tx: any) => {
          const profile = await active(tx, uid);
          tx.set(user(uid), {
            linkedApps: { [source]: { lastSeenAt: Timestamp.now() } },
            ...(profile.get('createdAt') === undefined ? { createdAt: Timestamp.now() } : {}), ...stamp(),
          }, { merge: true });
        });
        return { id: uid, sourceApp: source };
      }
      if (action === 'saveSession') {
        const input = sessionInput(d, now()), digest = hash(canonical(input));
        const ref = user(uid).collection('studySessions').doc(input.id);
        return db.runTransaction(async (tx: any) => {
          await active(tx, uid);
          const existing = await tx.get(ref);
          if (existing.exists) {
            if (existing.get('inputHash') !== digest)
              throw new StudyError('ALREADY_EXISTS', 'Session id has different content', 409);
            return { id: input.id, duplicate: true };
          }
          const parts = dailyParts(input.intervals), hourly = hourlyParts(input.intervals);
          const dayRefs = Object.keys(parts).map(day => user(uid).collection('dailyStats').doc(day));
          const stats = await Promise.all(dayRefs.map(r => tx.get(r)));
          const prior = await tx.get(user(uid).collection('studySessions')
            .where('endedAt', '>', Timestamp.fromMillis(input.startedAtMs)).orderBy('endedAt').limit(2001));
          if (prior.size > 2000) throw new StudyError('RESOURCE_EXHAUSTED', 'Too many overlapping candidate records', 429);
          for (const s of prior.docs) {
            if (s.get('startedAt').toMillis() >= input.endedAtMs) continue;
            const intervals = s.get('intervals') as { start: {toMillis(): number}; end: {toMillis(): number} }[];
            if (intervals.some(i => input.intervals.some(j => i.start.toMillis() < j.end && j.start < i.end.toMillis())))
              bad('Focus intervals overlap existing session');
          }
          const { startedAtMs, endedAtMs, intervals, ...rest } = input;
          tx.create(ref, {
            ...rest, ownerUid: uid, status: 'completed', syncVersion: 1, inputHash: digest,
            startedAt: Timestamp.fromMillis(startedAtMs), endedAt: Timestamp.fromMillis(endedAtMs),
            intervals: intervals.map(i => ({ start: Timestamp.fromMillis(i.start), end: Timestamp.fromMillis(i.end) })),
            ...stamp(), createdAt: Timestamp.now(),
          });
          stats.forEach((s: any, i: number) => {
            const subjects = { ...(s.get('subjectSeconds') as Record<string, number> | undefined) };
            subjects[input.subject] = (subjects[input.subject] ?? 0) + parts[s.id]!;
            const hours = { ...(s.get('hourlySeconds') as Record<string, number> | undefined) };
            for (const [h, seconds] of Object.entries(hourly[s.id] ?? {})) hours[h] = (hours[h] ?? 0) + seconds;
            tx.set(dayRefs[i]!, {
              ownerUid: uid, dateKey: s.id, ...(!s.exists ? { createdAt: Timestamp.now() } : {}),
              focusSeconds: Number(s.get('focusSeconds') ?? 0) + parts[s.id]!,
              sessionCount: Number(s.get('sessionCount') ?? 0) + 1,
              subjectSeconds: subjects, hourlySeconds: hours, ...stamp(),
            }, { merge: true });
          });
          tx.set(user(uid), { studySessionRevision: FieldValue.increment(1), ...stamp() }, { merge: true });
          return { id: input.id, duplicate: false };
        });
      }
      const collection = action === 'upsertExam' || action === 'deleteExam' ? 'exams' : 'studyJournal';
      if (action.startsWith('delete') && d.id === undefined) bad('id required');
      const docId = d.id === undefined
        ? action === 'saveJournal' && d.sessionId !== null && d.sessionId !== undefined
          ? id(d.sessionId) : db.collection('_').doc().id
        : id(d.id);
      const ref = user(uid).collection(collection).doc(docId);
      await db.runTransaction(async (tx: any) => {
        await active(tx, uid);
        const existing = await tx.get(ref), timestamp = Timestamp.now();
        let fields: Data;
        if (action.startsWith('delete')) {
          if (!existing.exists) throw new StudyError('NOT_FOUND', 'Record not found', 404);
          fields = action === 'deleteJournal'
            ? { deletedAt: timestamp, content: '', status: 'archived' }
            : { status: 'archived', archivedAt: timestamp };
        } else if (action === 'upsertExam') {
          const relatedGoalIds = d.relatedGoalIds;
          if (!Array.isArray(relatedGoalIds) || relatedGoalIds.length > 50) bad('relatedGoalIds');
          const ids = [...new Set((relatedGoalIds as unknown[]).map(id))];
          if (ids.length) bad('relatedGoalIds are not supported');
          fields = {
            title: str(d.title, 'title'), subject: str(d.subject, 'subject'),
            examDate: Timestamp.fromMillis(integer(d.examDateMs, 'examDateMs', 1, 253402300799999)),
            // Preserve associations already in older records without creating
            // new cross-app goal links.
            relatedGoalIds: existing.get('relatedGoalIds') ?? [], status: existing.get('status') ?? 'active',
          };
        } else {
          const sessionId = d.sessionId === null ? null : id(d.sessionId);
          if (sessionId) {
            const session = await tx.get(user(uid).collection('studySessions').doc(sessionId));
            if (!session.exists) bad('Unknown session');
          }
          fields = { sessionId, subject: str(d.subject, 'subject'),
            content: str(d.content, 'content', 10000), status: 'active', deletedAt: null };
        }
        tx.set(ref, { ...fields, ownerUid: uid, ...stamp(), ...(!existing.exists ? { createdAt: timestamp } : {}) }, { merge: true });
      });
      return { id: docId };
    },
  };
}

export function sharedStudyPersonal() { return createSharedStudyPersonal(getAdminFirestore()); }
