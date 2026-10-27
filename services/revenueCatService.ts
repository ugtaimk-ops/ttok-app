// Server-side handling of RevenueCat webhook events: verifies the request,
// then asks RevenueCat's own REST API for the subscriber's authoritative
// current entitlement state (rather than trying to infer it from the event
// type alone, which is easy to get subtly wrong across renewals/
// cancellations/grace periods/refunds) and writes isPremium accordingly.
import { timingSafeEqual } from "crypto";

const ENTITLEMENT_ID = "똑 Pro";
const FIRESTORE_DATABASE_ID = "ai-studio-22fbd27c-5516-4028-bd17-a6d4ba99710b";

export function verifyWebhookAuth(authHeader: string | undefined): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!expected) {
    console.warn("[RevenueCat] REVENUECAT_WEBHOOK_SECRET is not set - rejecting all webhook calls.");
    return false;
  }
  const actual = Buffer.from(authHeader || "");
  const wanted = Buffer.from(`Bearer ${expected}`);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function deleteRevenueCatCustomer(uid: string): Promise<void> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secretKey) throw new Error("REVENUECAT_SECRET_API_KEY is not set");
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  // RevenueCat queues successful deletions; 404 means there is no customer.
  if (res.status !== 200 && res.status !== 404) {
    throw new Error(`RevenueCat customer deletion failed: ${res.status}`);
  }
}

async function fetchIsEntitlementActive(appUserId: string): Promise<boolean> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secretKey) {
    throw new Error("REVENUECAT_SECRET_API_KEY is not set");
  }

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`[RevenueCat] Subscriber lookup failed: ${res.status}`);
  }

  const data = await res.json();
  const allEntitlements = data?.subscriber?.entitlements ?? {};
  const entitlement = allEntitlements[ENTITLEMENT_ID];
  if (!entitlement) {
    console.warn(
      `[RevenueCat] Subscriber ${appUserId} has no "${ENTITLEMENT_ID}" entitlement. ` +
      `Entitlements present: [${Object.keys(allEntitlements).join(", ") || "none"}]. ` +
      `If the purchase went through but this list is empty or has a different name, ` +
      `the RevenueCat dashboard's Entitlement isn't set up/attached to the product yet, ` +
      `or ENTITLEMENT_ID here doesn't match its identifier.`
    );
    return false;
  }

  // No expires_date means a non-expiring (lifetime) entitlement - active.
  if (!entitlement.expires_date) return true;
  return new Date(entitlement.expires_date).getTime() > Date.now();
}

async function setIsPremium(uid: string, isPremium: boolean): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getApps, initializeApp, cert } = require("firebase-admin/app");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getFirestore } = require("firebase-admin/firestore");

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
  }

  const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(rawKey)) });
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  await db.runTransaction(async (tx: any) => {
    const deleted = await tx.get(db.collection("deletedAccounts").doc(uid));
    if (deleted.exists) return;
    // Late renewals must not recreate a profile after account deletion.
    const userRef = db.collection("users").doc(uid);
    const user = await tx.get(userRef);
    if (!user.exists) return;
    tx.update(userRef, { isPremium });
  });
  console.log(`[RevenueCat] Set isPremium=${isPremium} for uid=${uid}`);
}

/**
 * Handles one RevenueCat webhook event. app_user_id is set to the Firebase
 * uid client-side (see purchaseService.ts), so it maps directly to a
 * users/{uid} document.
 */
export async function handleWebhookEvent(body: any): Promise<void> {
  const appUserId: string | undefined = body?.event?.app_user_id;
  const eventType: string | undefined = body?.event?.type;
  console.log(`[RevenueCat] Webhook event received: type=${eventType} app_user_id=${appUserId}`);
  const validUid = (uid: unknown): uid is string =>
    typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !uid.startsWith("$RCAnonymousID");
  if (eventType === "TRANSFER") {
    const users = [...(Array.isArray(body.event.transferred_from) ? body.event.transferred_from : []),
      ...(Array.isArray(body.event.transferred_to) ? body.event.transferred_to : [])];
    await Promise.all([...new Set(users.filter(validUid))].map(async (uid) =>
      setIsPremium(uid, await fetchIsEntitlementActive(uid))));
    return;
  }
  if (!validUid(appUserId)) {
    if (String(appUserId || "").startsWith("$RCAnonymousID")) return;
    throw new Error("RevenueCat webhook is missing a Firebase user id");
  }

  const isActive = await fetchIsEntitlementActive(appUserId);
  await setIsPremium(appUserId, isActive);
}
