import { Purchases } from "@revenuecat/purchases-capacitor";
import type { PurchasesOffering, CustomerInfo } from "@revenuecat/purchases-capacitor";

const ENTITLEMENT_ID = "premium";

let configuredForUid: string | null = null;

export const purchaseService = {
  /**
   * Must be called once the user is signed in, with their Firebase uid as
   * RevenueCat's app_user_id - that's what ties a purchase back to the right
   * users/{uid} Firestore doc when the webhook fires (see
   * services/revenueCatService.ts on the backend).
   */
  async configure(uid: string): Promise<void> {
    if (configuredForUid === uid) return;
    const apiKey = (import.meta as any).env?.VITE_REVENUECAT_API_KEY_ANDROID;
    if (!apiKey) {
      console.warn("[purchaseService] VITE_REVENUECAT_API_KEY_ANDROID is not set, skipping configure.");
      return;
    }
    try {
      await Purchases.configure({ apiKey, appUserID: uid });
      configuredForUid = uid;
    } catch (err) {
      console.error("[purchaseService] Failed to configure RevenueCat:", err);
    }
  },

  async getCurrentOffering(): Promise<PurchasesOffering | null> {
    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    } catch (err) {
      console.error("[purchaseService] Failed to fetch offerings:", err);
      return null;
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
  }
};
