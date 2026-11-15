import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSharedStudyPersonal, parseAction, sessionInput, dailyParts } from '../services/sharedStudyPersonal';
import { dispatchRoomAction } from '../services/sharedRoomsService';

class Ref {
  constructor(public store: Map<string, Record<string, any>>, public path: string) {}
  get id() { return this.path.split('/').at(-1)!; }
  collection(name: string) { return new Collection(this.store, `${this.path}/${name}`); }
  get() { return Promise.resolve(new Snap(this.path, this.store.get(this.path))); }
}
class Snap {
  id: string; exists: boolean;
  constructor(public path: string, public value?: Record<string, any>) {
    this.id = path.split('/').at(-1)!; this.exists = !!value;
  }
  get(name: string) { return this.value?.[name]; }
  data() { return this.value; }
}
class Collection {
  constructor(public store: Map<string, Record<string, any>>, public path: string) {}
  doc(id = 'generated_id') { return new Ref(this.store, `${this.path}/${id}`); }
  limit(_n: number) { return this; }
  where(_field: string, _op: string, _value: unknown) { return this; }
  orderBy(_field: string) { return this; }
  get() {
    const docs = [...this.store].filter(([key]) => key.startsWith(`${this.path}/`) &&
      !key.slice(this.path.length + 1).includes('/')).map(([key, value]) => new Snap(key, value));
    return Promise.resolve({ docs, size: docs.length });
  }
}
function fakeDb() {
  const store = new Map<string, Record<string, any>>();
  const tx = {
    get: (ref: Ref | Collection) => ref.get(),
    set(ref: Ref, value: Record<string, any>, options?: {merge: boolean}) {
      store.set(ref.path, options?.merge ? { ...store.get(ref.path), ...value } : value);
    },
    create(ref: Ref, value: Record<string, any>) {
      if (store.has(ref.path)) throw Error('duplicate');
      store.set(ref.path, value);
    },
    update(ref: Ref, value: Record<string, any>) { store.set(ref.path, { ...store.get(ref.path), ...value }); },
  };
  return { store, db: { collection: (name: string) => new Collection(store, name), runTransaction: (fn: (transaction: any) => Promise<unknown>) => fn(tx) } };
}
const base = {
  id: 'session_1', goalId: null, subject: 'Math', timerMode: 'pomodoro',
  startedAtMs: 100000, endedAtMs: 110000, focusSeconds: 8,
  intervals: [{ start: 100000, end: 104000 }, { start: 106000, end: 110000 }], sourceApp: 'timer',
};

test('action gate requires identity and excludes goals and friends', () => {
  assert.throws(() => parseAction({ action: 'upsertExam', expectedUid: 'other' }, 'u'), /expectedUid/);
  assert.throws(() => parseAction({ action: 'upsertGoal', expectedUid: 'u' }, 'u'), /Unknown action/);
  assert.throws(() => parseAction({ action: 'requestFriend', expectedUid: 'u' }, 'u'), /Unknown action/);
  assert.throws(() => parseAction({ action: 'saveSession', expectedUid: 'u', payload: { expectedUid: 'other' } }, 'u'), /expectedUid/);
  assert.equal(parseAction({ action: 'saveSession', expectedUid: 'u', payload: base }, 'u').action, 'saveSession');
});
test('session validation rejects inflated or overlapping focus', () => {
  assert.throws(() => sessionInput({ ...base, focusSeconds: 9 }, 120000), /focusSeconds/);
  assert.throws(() => sessionInput({ ...base, intervals: [{ start: 100000, end: 106000 }, { start: 105000, end: 110000 }] }, 120000), /start/);
  assert.throws(() => sessionInput({ ...base, id: '../outside' }, 120000), /Invalid id/);
  assert.deepEqual(dailyParts(base.intervals), { '1970-01-01': 8 });
});
test('saveSession is idempotent and updates dailyStats once', async () => {
  const { db, store } = fakeDb();
  const service = createSharedStudyPersonal(db as any, () => 120000);
  assert.equal(sessionInput({ ...base, goalId: 'goal_1' }, 120000).goalId, null);
  assert.deepEqual(await service.action('u', 'saveSession', base), { id: 'session_1', duplicate: false });
  assert.deepEqual(await service.action('u', 'saveSession', { ...base, intervals: base.intervals.map(i => ({ end: i.end, start: i.start })) }), { id: 'session_1', duplicate: true });
  await assert.rejects(service.action('u', 'saveSession', { ...base, subject: 'Science' }), /different content/);
  assert.equal(store.get('users/u/dailyStats/1970-01-01')?.focusSeconds, 8);
  assert.equal(store.get('users/u/dailyStats/1970-01-01')?.sessionCount, 1);
  assert.equal(store.get('users/u/studySessions/session_1')?.ownerUid, 'u');
});
test('exam and journal validate references, archive, and isolate reads', async () => {
  const { db, store } = fakeDb();
  const service = createSharedStudyPersonal(db as any, () => 120000);
  await assert.rejects(service.action('u', 'upsertExam', { id: 'exam_1', title: 'Test', subject: 'Math', examDateMs: 200000, relatedGoalIds: ['missing'] }), /relatedGoalIds are not supported/);
  await service.action('u', 'upsertExam', { id: 'exam_1', title: 'Test', subject: 'Math', examDateMs: 200000, relatedGoalIds: [] });
  await service.action('u', 'deleteExam', { id: 'exam_1' });
  assert.equal(store.get('users/u/exams/exam_1')?.status, 'archived');
  await assert.rejects(service.action('u', 'saveJournal', { id: 'journal_1', sessionId: 'missing', subject: 'Math', content: 'Notes' }), /Unknown session/);
  await service.action('u', 'saveJournal', { id: 'journal_1', sessionId: null, subject: 'Math', content: 'Notes' });
  await service.action('u', 'deleteJournal', { id: 'journal_1' });
  assert.equal(store.get('users/u/studyJournal/journal_1')?.content, '');
  assert.equal((await service.read('u', 'exams')).items.length, 1);
  assert.equal((await service.read('other', 'exams')).items.length, 0);
  await assert.rejects(service.read('u', 'goals'), /Unknown collection/);
  store.set('deletedAccounts/u', { deletedAt: true });
  await assert.rejects(service.read('u', 'exams'), /Account deletion pending/);
});

test('private room requires membership and approval before another account can read it', async () => {
  const { db, store } = fakeDb();
  store.set('users/owner', { studyDisplayName: 'Owner' });
  store.set('users/guest', { studyDisplayName: 'Guest' });
  const created = await dispatchRoomAction(db as any, 'owner', 'createRoom', {
    title: 'Math', subject: 'Math', capacity: 2, expectedUid: 'owner',
  }) as {roomId:string};
  const roomId = created.roomId;
  await assert.rejects(dispatchRoomAction(db as any, 'guest', 'getRoom', { roomId }), /Not permitted/);
  const invitation = await dispatchRoomAction(db as any, 'owner', 'inviteRoom', { roomId }) as {inviteCode:string};
  assert.equal((await dispatchRoomAction(db as any, 'guest', 'joinRoom', { inviteCode: invitation.inviteCode }) as any).status, 'pending');
  await assert.rejects(dispatchRoomAction(db as any, 'guest', 'getRoom', { roomId }), /Not permitted/);
  await dispatchRoomAction(db as any, 'owner', 'approveJoin', { roomId, targetUid: 'guest', accept: true });
  const detail = await dispatchRoomAction(db as any, 'guest', 'getRoom', { roomId }) as {room:{id:string};members:unknown[];requests:unknown[]};
  assert.equal(detail.room.id, roomId);
  assert.equal(detail.members.length, 2);
  assert.equal(detail.requests.length, 0);
  assert.equal((await dispatchRoomAction(db as any, 'guest', 'listMyRooms', {}) as {rooms:unknown[]}).rooms.length, 1);
  await assert.rejects(dispatchRoomAction(db as any, 'guest', 'inviteRoom', { roomId }), /Not permitted/);
});

test('shared study read marks a truncated backup as incomplete', async () => {
  const { db, store } = fakeDb();
  for (let i = 0; i < 201; i++) store.set(`users/u/exams/exam_${i}`, { title: `Exam ${i}` });
  const page = await createSharedStudyPersonal(db as any).read('u', 'exams');
  assert.equal(page.items.length, 200);
  assert.equal(page.hasMore, true);
});
