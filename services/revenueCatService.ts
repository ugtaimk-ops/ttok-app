// Server-side handling of RevenueCat webhook events: verifies the request,
// then asks RevenueCat's own REST API for the subscriber's authoritative
// current entitlement state (rather than trying to infer it from the event
// type alone, which is easy to get subtly wrong across renewals/
// cancellations/grace periods/refunds) and writes isPremium accordingly.

const ENTITLEMENT_ID = "똑 Pro";
const FIRESTORE_DATABASE_ID = "ai-studio-22fbd27c-5516-4028-bd17-a6d4ba99710b";

export function verifyWebhookAuth(authHeader: string | undefined): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!expected) {
    console.warn("[RevenueCat] REVENUECAT_WEBHOOK_SECRET is not set - rejecting all webhook calls.");
    return false;
  }
  return authHeader === `Bearer ${expected}`;
}

async function fetchIsEntitlementActive(appUserId: string): Promise<boolean | null> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secretKey) {
    console.error("[RevenueCat] REVENUECAT_SECRET_API_KEY is not set - cannot verify subscriber state.");
    return null;
  }

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` }
  });

  if (!res.ok) {
    console.error(`[RevenueCat] Failed to fetch subscriber ${appUserId}: ${res.status} ${await res.text()}`);
    return null;
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
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApps, initializeApp, cert } = require("firebase-admin/app");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFirestore } = require("firebase-admin/firestore");

    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!rawKey) {
      console.error("[RevenueCat] FIREBASE_SERVICE_ACCOUNT_KEY is not set - cannot update isPremium.");
      return;
    }

    const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(rawKey)) });
    const db = getFirestore(app, FIRESTORE_DATABASE_ID);
    await db.collection("users").doc(uid).set({ isPremium }, { merge: true });
    console.log(`[RevenueCat] Set isPremium=${isPremium} for uid=${uid}`);
  } catch (err) {
    console.error("[RevenueCat] Failed to update isPremium in Firestore:", err);
  }
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
  if (!appUserId) {
    console.warn("[RevenueCat] Webhook event missing app_user_id, ignoring:", eventType);
    return;
  }

  const isActive = await fetchIsEntitlementActive(appUserId);
  if (isActive === null) {
    // Couldn't verify - don't guess either way, leave the existing value alone.
    return;
  }
  await setIsPremium(appUserId, isActive);
}
