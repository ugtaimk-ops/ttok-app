import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { Firestore, Transaction } from "firebase-admin/firestore";

type Data = Record<string, unknown>;
type RoomAction = "createRoom" | "inviteRoom" | "joinRoom" | "approveJoin" | "roomPresence" | "leaveRoom" | "moderateRoom" | "listMyRooms" | "getRoom" | "roomTimer";
export const ROOM_ACTIONS = new Set<string>(["createRoom", "inviteRoom", "joinRoom", "approveJoin", "roomPresence", "leaveRoom", "moderateRoom", "listMyRooms", "getRoom", "roomTimer"]);

export class RoomActionError extends Error {
  constructor(public readonly code: "invalid-argument" | "permission-denied" | "resource-exhausted" | "failed-precondition", message: string) {
    super(message);
    this.name = "RoomActionError";
  }
}

const error = (code: RoomActionError["code"], message: string): never => { throw new RoomActionError(code, message); };
const denied = (message = "Not permitted"): never => error("permission-denied", message);
const invalid = (message: string): never => error("invalid-argument", message);
const string = (value: unknown, name: string, max = 120): string =>
  typeof value === "string" && value.trim() && value.length <= max ? value.trim() : invalid(name);
const id = (value: unknown): string => {
  const valueString = string(value, "id", 128);
  return /^[A-Za-z0-9_-]+$/.test(valueString) ? valueString : invalid("Invalid id");
};
const integer = (value: unknown, name: string, min: number, max: number): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : invalid(name);
const choice = <T extends string>(value: unknown, choices: readonly T[]): T =>
  choices.includes(value as T) ? value as T : invalid("Invalid enum");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const nodeRequire = createRequire(process.cwd() + '/package.json');
const timestamp = (): typeof import("firebase-admin/firestore").Timestamp => nodeRequire("firebase-admin/firestore").Timestamp;
const stamp = () => ({ schemaVersion: 1, updatedAt: timestamp().now() });
const user = (db: Firestore, uid: string) => db.collection("users").doc(uid);
const room = (db: Firestore, rid: string) => db.collection("studyRooms").doc(rid);

async function active(tx: Transaction, db: Firestore, uid: string) {
  const [profile, deleted] = await Promise.all([
    tx.get(user(db, uid)), tx.get(db.collection("deletedAccounts").doc(uid)),
  ]);
  if (!profile.exists || deleted.exists || profile.get("studyDeleting") === true) denied();
  return profile;
}

async function bilateral(tx: Transaction, db: Firestore, a: string, b: string) {
  if (a === b) denied();
  const [ap, bp, ab, ba, blockA, blockB] = await Promise.all([
    active(tx, db, a), active(tx, db, b),
    tx.get(user(db, a).collection("friends").doc(b)),
    tx.get(user(db, b).collection("friends").doc(a)),
    tx.get(user(db, a).collection("blocks").doc(b)),
    tx.get(user(db, b).collection("blocks").doc(a)),
  ]);
  if (!ap.exists || !bp.exists || blockA.exists || blockB.exists ||
      ab.get("status") === "blocked" || ba.get("status") === "blocked") denied("Relationship unavailable");
}

async function membership(tx: Transaction, db: Firestore, uid: string, rid: string, ownerOnly = false) {
  const ref = room(db, rid);
  const [r, m] = await Promise.all([tx.get(ref), tx.get(ref.collection("members").doc(uid)), active(tx, db, uid)]);
  if (!r.exists || m.get("uid") !== uid || m.get("approval") !== "approved" ||
      m.get("ownerUid") !== r.get("ownerUid") ||
      m.get("role") !== (r.get("ownerUid") === uid ? "owner" : "member") ||
      (ownerOnly && r.get("ownerUid") !== uid)) denied();
  return r;
}

function summary(r: FirebaseFirestore.DocumentSnapshot) {
  return { id: r.id, title: r.get("title"), subject: r.get("subject"),
    capacity: r.get("capacity"), status: r.get("status"), ownerUid: r.get("ownerUid") };
}

/** The caller must pass the uid from a verified Firebase ID token, never a request-body uid. */
export async function dispatchRoomAction(
  db: Firestore, uid: string, action: RoomAction | string, data: Data,
): Promise<unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) invalid("Expected object");
  if (data.expectedUid !== undefined && data.expectedUid !== uid) denied("expectedUid does not match authenticated user");
  const d = data;
  if (action === "listMyRooms") {
    return db.runTransaction(async tx => {
      await active(tx, db, uid);
      const index = await tx.get(user(db, uid).collection("roomMemberships"));
      const rooms = [];
      for (const entry of index.docs) {
        const ref = room(db, entry.id);
        const [r, m] = await Promise.all([tx.get(ref), tx.get(ref.collection("members").doc(uid))]);
        if (!r.exists || r.get("state") !== "active" || m.get("uid") !== uid ||
            m.get("ownerUid") !== r.get("ownerUid") || m.get("approval") !== "approved" ||
            m.get("role") !== (r.get("ownerUid") === uid ? "owner" : "member")) continue;
        if (r.get("ownerUid") !== uid) await bilateral(tx, db, uid, r.get("ownerUid"));
        rooms.push(summary(r));
      }
      return { rooms };
    });
  }
  if (action === "createRoom") {
    const title = string(d.title, "title", 100), subject = string(d.subject, "subject");
    const capacity = integer(d.capacity, "capacity", 2, 6);
    const ref = db.collection("studyRooms").doc();
    await db.runTransaction(async tx => {
      const profile = await active(tx, db, uid);
      const [index, owned] = await Promise.all([
        tx.get(user(db, uid).collection("roomMemberships")),
        tx.get(db.collection("studyRooms").where("ownerUid", "==", uid)),
      ]);
      if (index.size >= 20) error("resource-exhausted", "Maximum 20 rooms");
      if (owned.docs.filter(r => r.get("state") === "active").length >= 5)
        error("resource-exhausted", "Maximum five owned active rooms");
      const now = timestamp().now();
      tx.create(ref, { title, subject, capacity, ownerUid: uid, state: "active", status: "active",
        memberCount: 1, ...stamp(), createdAt: now });
      tx.create(user(db, uid).collection("roomMemberships").doc(ref.id),
        { ownerUid: uid, roomId: ref.id, role: "owner", ...stamp() });
      tx.create(ref.collection("members").doc(uid),
        { uid, displayName: profile.get("studyDisplayName") ?? "", ownerUid: uid,
          approval: "approved", status: "offline", role: "owner", presence: "offline",
          expiresAt: now, ...stamp(), createdAt: now });
    });
    return { id: ref.id, roomId: ref.id };
  }
  if (action === "joinRoom") {
    const code = string(d.inviteCode, "inviteCode", 64);
    if (!/^[a-f0-9]{48}$/.test(code)) invalid("inviteCode");
    return db.runTransaction(async tx => {
      await active(tx, db, uid);
      const invite = await tx.get(db.collection("studyRoomInvites").doc(sha256(code)));
      if (!invite.exists || !invite.get("expiresAt") || invite.get("expiresAt").toMillis() <= Date.now()) denied("Invite expired");
      const rid = id(invite.get("roomId"));
      const ref = room(db, rid);
      const [r, m, members, previous] = await Promise.all([
        tx.get(ref), tx.get(ref.collection("members").doc(uid)),
        tx.get(ref.collection("members")), tx.get(ref.collection("joinRequests").doc(uid)),
      ]);
      if (!r.exists || r.get("state") !== "active" || r.get("ownerUid") !== invite.get("ownerUid")) denied("Room closed");
      const owner = r.get("ownerUid") as string;
      if (uid === owner) denied("Owner membership unavailable");
      if (previous.get("status") === "kicked") denied("Removed from room");
      for (const member of members.docs) await bilateral(tx, db, uid, member.id);
      if (m.get("approval") === "approved" && m.get("ownerUid") === owner)
        return { id: rid, roomId: rid, status: "approved" };
      tx.set(ref.collection("joinRequests").doc(uid),
        { uid, requesterUid: uid, targetUid: uid, ownerUid: owner, status: "pending", ...stamp(), createdAt: timestamp().now() });
      return { id: rid, roomId: rid, status: "pending" };
    });
  }
  if (!["getRoom", "inviteRoom", "approveJoin", "roomPresence", "leaveRoom", "moderateRoom", "roomTimer"].includes(action))
    invalid("Unknown room action");
  const rid = id(d.roomId), ref = room(db, rid);
  if (action === "getRoom") return db.runTransaction(async tx => {
    const r = await membership(tx, db, uid, rid);
    if (r.get("state") !== "active") denied("Room closed");
    if (r.get("ownerUid") !== uid) await bilateral(tx, db, uid, r.get("ownerUid"));
    const [memberSnapshot, timerSnapshot, requestSnapshot] = await Promise.all([
      tx.get(ref.collection("members")),
      tx.get(ref.collection("sessions").doc("current")),
      r.get("ownerUid") === uid ? tx.get(ref.collection("joinRequests")) : Promise.resolve(null),
    ]);
    return {
      room: summary(r),
      members: memberSnapshot.docs.map(m => ({ id: m.id, uid: m.get("uid"), displayName: m.get("displayName") ?? "", status: m.get("status"), approval: m.get("approval"), role: m.get("role"), expiresAt: m.get("expiresAt") })),
      currentTimer: timerSnapshot.exists ? timerSnapshot.data() : null,
      requests: requestSnapshot ? requestSnapshot.docs.map(q => ({ id: q.id, uid: q.get("uid"), status: q.get("status") })) : [],
    };
  });
  if (action === "inviteRoom") {
    const inviteCode = randomBytes(24).toString("hex"), expiresAtMs = Date.now() + 86400000;
    await db.runTransaction(async tx => {
      const r = await membership(tx, db, uid, rid, true);
      if (r.get("state") !== "active") denied("Room closed");
      tx.create(db.collection("studyRoomInvites").doc(sha256(inviteCode)),
        { roomId: rid, ownerUid: uid, expiresAt: timestamp().fromMillis(expiresAtMs), ...stamp() });
    });
    return { id: rid, roomId: rid, inviteCode, expiresAtMs };
  }
  const moderation = d.roomAction ?? d.operation;
  return db.runTransaction(async tx => {
    const ownerOnly = action === "approveJoin" || action === "roomTimer" || (action === "moderateRoom" && moderation === "kick");
    const r = await membership(tx, db, uid, rid, ownerOnly);
    if (r.get("state") !== "active") denied("Room closed");
    const owner = r.get("ownerUid") as string;
    if (uid !== owner) await bilateral(tx, db, uid, owner);
    if (action === "roomTimer") return roomTimer(tx, db, uid, rid, d);
    if (action === "roomPresence") {
      const status = choice(d.status, ["focus", "break", "offline"] as const);
      const members = await tx.get(ref.collection("members"));
      for (const m of members.docs) if (m.id !== uid) await bilateral(tx, db, uid, m.id);
      const expiresAtMs = status === "offline" ? Date.now() : Date.now() + 90000;
      tx.update(ref.collection("members").doc(uid), { status, presence: status,
        expiresAt: timestamp().fromMillis(expiresAtMs), ...stamp() });
      return { id: uid, expiresAtMs };
    }
    if (action === "leaveRoom") {
      if (owner === uid) {
        const members = await tx.get(ref.collection("members"));
        tx.update(ref, { state: "closed", status: "closed", memberCount: 0, ...stamp() });
        for (const m of members.docs) {
          tx.delete(m.ref);
          tx.delete(user(db, m.id).collection("roomMemberships").doc(rid));
        }
      } else {
        tx.delete(user(db, uid).collection("roomMemberships").doc(rid));
        tx.delete(ref.collection("members").doc(uid));
        tx.update(ref, { memberCount: Math.max(0, Number(r.get("memberCount")) - 1), ...stamp() });
      }
      return { id: rid, status: owner === uid ? "closed" : "left" };
    }
    const targetUid = id(d.targetUid);
    if (targetUid === uid) denied();
    const targetRef = ref.collection("members").doc(targetUid), requestRef = ref.collection("joinRequests").doc(targetUid);
    const [target, request] = await Promise.all([tx.get(targetRef), tx.get(requestRef)]);
    if (action === "approveJoin") {
      if (typeof d.accept !== "boolean") invalid("Expected boolean");
      if (request.get("status") !== "pending" || request.get("requesterUid") !== targetUid || request.get("ownerUid") !== owner)
        denied("No pending request");
      if (target.exists) denied("Already a member");
      if (d.accept) {
        const [profile, index, members] = await Promise.all([
          active(tx, db, targetUid), tx.get(user(db, targetUid).collection("roomMemberships")),
          tx.get(ref.collection("members")),
        ]);
        if (index.size >= 20) error("resource-exhausted", "Maximum 20 rooms");
        for (const m of members.docs) await bilateral(tx, db, targetUid, m.id);
        if (Number(r.get("memberCount")) >= Number(r.get("capacity"))) error("resource-exhausted", "Room full");
        const now = timestamp().now();
        tx.set(user(db, targetUid).collection("roomMemberships").doc(rid),
          { ownerUid: targetUid, roomId: rid, role: "member", ...stamp() });
        tx.create(targetRef, { uid: targetUid, displayName: profile.get("studyDisplayName") ?? "",
          ownerUid: owner, approval: "approved", status: "offline", role: "member",
          presence: "offline", expiresAt: now, ...stamp(), createdAt: now });
        tx.update(ref, { memberCount: Number(r.get("memberCount")) + 1, ...stamp() });
      }
      tx.update(requestRef, { status: d.accept ? "approved" : "rejected", ...stamp() });
      return { id: targetUid, status: d.accept ? "approved" : "rejected" };
    }
    const operation = choice(moderation, ["kick", "report"] as const);
    if (!target.exists || target.get("approval") !== "approved" || (operation === "kick" && targetUid === owner)) denied("Invalid target");
    await bilateral(tx, db, uid, targetUid);
    if (operation === "kick") {
      tx.delete(user(db, targetUid).collection("roomMemberships").doc(rid));
      tx.delete(targetRef);
      tx.set(requestRef, { uid: targetUid, requesterUid: targetUid, ownerUid: owner, status: "kicked", ...stamp() });
      tx.update(ref, { memberCount: Number(r.get("memberCount")) - 1, ...stamp() });
      return { id: targetUid, status: "kicked" };
    }
    const report = ref.collection("reports").doc();
    tx.create(report, { reporterUid: uid, targetUid,
      reason: d.reason === undefined ? "unspecified" : string(d.reason, "reason", 1000),
      ...stamp(), createdAt: timestamp().now() });
    return { id: report.id, status: "reported" };
  });
}

async function roomTimer(tx: Transaction, db: Firestore, uid: string, rid: string, d: Data) {
  const command = choice(d.command, ["start", "pause", "resume", "end"] as const);
  const ref = room(db, rid).collection("sessions").doc("current");
  const old = await tx.get(ref), now = timestamp().now();
  const state = old.get("status") as string | undefined;
  const remaining = state === "running"
    ? Math.max(0, Math.ceil((old.get("endsAt").toMillis() - now.toMillis()) / 1000))
    : Number(old.get("remainingSeconds") ?? 0);
  let value: Data;
  if (command === "start") {
    if (old.exists && state !== "completed" && remaining > 0) error("failed-precondition", "Timer already active");
    const focusSeconds = integer(d.focusSeconds, "focusSeconds", 1, 86400);
    if (old.exists) tx.create(room(db, rid).collection("sessions").doc(),
      { ...old.data(), status: "completed", remainingSeconds: 0, ...stamp() });
    value = { ownerUid: uid, startedAt: now,
      endsAt: timestamp().fromMillis(now.toMillis() + focusSeconds * 1000),
      status: "running", remainingSeconds: focusSeconds, focusSeconds, createdAt: now };
  } else {
    if (!old.exists) error("failed-precondition", "Start timer first");
    if (command === "end" || remaining === 0)
      value = { status: "completed", remainingSeconds: 0, endsAt: now };
    else if (command === "pause") {
      if (state !== "running") error("failed-precondition", "Timer is not running");
      value = { status: "paused", remainingSeconds: remaining, endsAt: null };
    } else {
      if (state !== "paused") error("failed-precondition", "Timer is not paused");
      value = { status: "running", endsAt: timestamp().fromMillis(now.toMillis() + remaining * 1000),
        remainingSeconds: remaining };
    }
  }
  tx.set(ref, { ...value, ...stamp() }, { merge: true });
  return { id: "current", roomId: rid, ...value };
}
