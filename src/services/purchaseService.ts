import { Purchases } from "@revenuecat/purchases-capacitor";
import type { PurchasesOffering, CustomerInfo } from "@revenuecat/purchases-capacitor";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { auth } from "../lib/firebase";

const ENTITLEMENT_ID = "똑 Pro";
// Fallback if RevenueCat doesn't hand back a subscription-specific
// managementURL (e.g. before a real purchase has ever gone through) - takes
// the user to their general Play Store subscriptions list instead.
const PLAY_STORE_SUBSCRIPTIONS_URL = "https://play.google.com/store/account/subscriptions?package=com.ttokapp.app";

let configuredForUid: string | null = null;
let pendingConfiguration: Promise<void> | null = null;

export const purchaseService = {
  /**
   * Must be called once the user is signed in, with their Firebase uid as
   * RevenueCat's app_user_id - that's what ties a purchase back to the right
   * users/{uid} Firestore doc when the webhook fires (see
   * services/revenueCatService.ts on the backend).
   */
  async configure(uid: string): Promise<void> {
    if (configuredForUid === uid) return;
    // Settings can request offerings while this asynchronous initialization is
    // still running. Also serialize account switches so purchases use the
    // currently signed-in Firebase user as RevenueCat's app user ID.
    if (pendingConfiguration) await pendingConfiguration;
    if (configuredForUid === uid) return;
    // RevenueCat ties each public API key to one platform (Apple App Store vs
    // Google Play) - using the Android key on iOS (or vice versa) fails with
    // an "invalid API key" error from the SDK.
    const env = (import.meta as any).env;
    const isIOS = Capacitor.getPlatform() === "ios";
    const apiKey = isIOS ? env?.VITE_REVENUECAT_API_KEY_IOS : env?.VITE_REVENUECAT_API_KEY_ANDROID;
    if (!apiKey) {
      console.warn(`[purchaseService] VITE_REVENUECAT_API_KEY_${isIOS ? "IOS" : "ANDROID"} is not set, skipping configure.`);
      return;
    }
    pendingConfiguration = (async () => {
      if (configuredForUid) await Purchases.logIn({ appUserID: uid });
      else await Purchases.configure({ apiKey, appUserID: uid });
      configuredForUid = uid;
    })().catch((err) => {
      console.error("[purchaseService] Failed to configure RevenueCat:", err);
    }).finally(() => { pendingConfiguration = null; });
    await pendingConfiguration;
  },

  async getCurrentOffering(): Promise<PurchasesOffering> {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("RevenueCat requested before Firebase sign-in completed");
      await this.configure(uid);
      if (configuredForUid !== uid) throw new Error("RevenueCat is not configured for this account");
      const offerings = await Purchases.getOfferings();
      const offering = offerings.current;
      if (!offering?.availablePackages?.length) {
        console.warn("[purchaseService] Google Play returned no purchasable packages for the current offering.");
        throw new Error("No purchasable packages in current offering");
      }
      return offering;
    } catch (err) {
      console.error("[purchaseService] Failed to fetch offerings:", err);
      throw err;
    }
  },

  async purchasePackage(pkg: any): Promise<CustomerInfo> {
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    return result.customerInfo;
  },

  async restorePurchases(): Promise<CustomerInfo> {
    const result = await Purchases.restorePurchases();
    return result.customerInfo;
  },

  /**
   * Local/instant check for UI feedback right after a purchase or restore.
   * The AUTHORITATIVE isPremium value the rest of the app relies on (usage
   * limits, etc.) always comes from Firestore, kept in sync by the
   * RevenueCat webhook - this is only for immediate UI response before that
   * webhook round-trip lands.
   */
  isEntitlementActive(customerInfo: CustomerInfo): boolean {
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  },

  /**
   * Opens Google Play's native subscription management page, where the user
   * can cancel or change their plan - Play Billing policy requires directing
   * users there rather than implementing custom cancel/refund flows in-app.
   */
  async openManageSubscription(): Promise<void> {
    let url = PLAY_STORE_SUBSCRIPTIONS_URL;
    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      if (customerInfo.managementURL) url = customerInfo.managementURL;
    } catch (err) {
      console.warn("[purchaseService] Failed to fetch managementURL, falling back to generic subscriptions page:", err);
    }
    await Browser.open({ url });
  }
};
