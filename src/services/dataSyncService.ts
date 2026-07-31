import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  Unsubscribe
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserProfile, ScheduleItem, TodoItem, ScriptItem, PracticeLog } from "../types";

type WithId = { id: string };

const userDocRef = (uid: string) => doc(db, "users", uid);
const subCollectionRef = (uid: string, name: string) => collection(db, "users", uid, name);
const subDocRef = (uid: string, name: string, id: string) => doc(db, "users", uid, name, id);

function subscribeToItems<T extends WithId>(uid: string, name: string, cb: (items: T[]) => void): Unsubscribe {
  return onSnapshot(
    subCollectionRef(uid, name),
    (snap) => cb(snap.docs.map((d) => d.data() as T)),
    (err) => console.error(`[Sync] ${name} listener error:`, err)
  );
}

function saveItem(uid: string, name: string, item: WithId): Promise<void> {
  return setDoc(subDocRef(uid, name, item.id), item, { merge: true }).catch((err) =>
    console.error(`[Sync] Failed to save ${name}/${item.id}:`, err)
  );
}

function deleteItem(uid: string, name: string, id: string): Promise<void> {
  return deleteDoc(subDocRef(uid, name, id)).catch((err) =>
    console.error(`[Sync] Failed to delete ${name}/${id}:`, err)
  );
}

/**
 * One-time upload of local-only items to the cloud, but only if the cloud
 * collection is still empty. Prevents wiping out a device's existing local
 * data the first time it signs in, and avoids clobbering data that's
 * already synced from another device on subsequent logins.
 */
async function migrateLocalItemsIfCloudEmpty<T extends WithId>(uid: string, name: string, localItems: T[]): Promise<void> {
  if (localItems.length === 0) return;
  try {
    const snap = await getDocs(subCollectionRef(uid, name));
    if (snap.empty) {
      await Promise.all(localItems.map((item) => saveItem(uid, name, item)));
      console.log(`[Sync] Migrated ${localItems.length} local ${name} item(s) to the cloud`);
    }
  } catch (err) {
    console.error(`[Sync] Migration check failed for ${name}:`, err);
  }
}

async function clearCollection(uid: string, name: string): Promise<void> {
  try {
    const snap = await getDocs(subCollectionRef(uid, name));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (err) {
    console.error(`[Sync] Failed to clear ${name}:`, err);
  }
}

export const dataSyncService = {
  subscribeToProfile(uid: string, cb: (data: Partial<UserProfile> | null) => void): Unsubscribe {
    return onSnapshot(
      userDocRef(uid),
      (snap) => cb(snap.exists() ? (snap.data() as Partial<UserProfile>) : null),
      (err) => console.error("[Sync] profile listener error:", err)
    );
  },
  saveProfile(uid: string, profile: UserProfile): Promise<void> {
    return setDoc(userDocRef(uid), profile, { merge: true }).catch((err) =>
      console.error("[Sync] Failed to save profile:", err)
    );
  },

  subscribeToSchedules: (uid: string, cb: (items: ScheduleItem[]) => void) => subscribeToItems<ScheduleItem>(uid, "schedules", cb),
  saveSchedule: (uid: string, item: ScheduleItem) => saveItem(uid, "schedules", item),
  deleteSchedule: (uid: string, id: string) => deleteItem(uid, "schedules", id),
  migrateSchedulesIfEmpty: (uid: string, items: ScheduleItem[]) => migrateLocalItemsIfCloudEmpty(uid, "schedules", items),

  subscribeToTodos: (uid: string, cb: (items: TodoItem[]) => void) => subscribeToItems<TodoItem>(uid, "todos", cb),
  saveTodo: (uid: string, item: TodoItem) => saveItem(uid, "todos", item),
  deleteTodo: (uid: string, id: string) => deleteItem(uid, "todos", id),
  migrateTodosIfEmpty: (uid: string, items: TodoItem[]) => migrateLocalItemsIfCloudEmpty(uid, "todos", items),

  subscribeToScripts: (uid: string, cb: (items: ScriptItem[]) => void) => subscribeToItems<ScriptItem>(uid, "scripts", cb),
  saveScript: (uid: string, item: ScriptItem) => saveItem(uid, "scripts", item),
  deleteScript: (uid: string, id: string) => deleteItem(uid, "scripts", id),
  migrateScriptsIfEmpty: (uid: string, items: ScriptItem[]) => migrateLocalItemsIfCloudEmpty(uid, "scripts", items),

  subscribeToPracticeLogs: (uid: string, cb: (items: PracticeLog[]) => void) => subscribeToItems<PracticeLog>(uid, "practiceLogs", cb),
  savePracticeLog: (uid: string, item: PracticeLog) => saveItem(uid, "practiceLogs", item),
  migratePracticeLogsIfEmpty: (uid: string, items: PracticeLog[]) => migrateLocalItemsIfCloudEmpty(uid, "practiceLogs", items),

  async clearAllUserData(uid: string): Promise<void> {
    await Promise.all([
      clearCollection(uid, "schedules"),
      clearCollection(uid, "todos"),
      clearCollection(uid, "scripts"),
      clearCollection(uid, "practiceLogs")
    ]);
  }
};
