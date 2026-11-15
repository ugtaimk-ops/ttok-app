import { Purchases } from "@revenuecat/purchases-capacitor";
import type { CustomerInfo, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { auth } from "../lib/firebase";
import { robustFetch } from "../lib/api";

const ENTITLEMENT_ID = "똑 Pro";
// Fallback if RevenueCat doesn't hand back a subscription-specific
// managementURL (e.g. before a real purchase has ever gone through) - takes
// the user to their general Play Store subscriptions list instead.
const PLAY_STORE_SUBSCRIPTIONS_URL = "https://play.google.com/store/account/subscriptions?package=com.ttokapp.app";

let configuredForUid: string | null = null;
let pendingConfiguration: Promise<void> | null = null;
export const V6_PRODUCT_IDS = {
  basic: "ttok_ai_basic_monthly",
  pro: "ttok_pro_v2_monthly",
  plus: "ttok_ai_plus_monthly",
} as const;

function describePurchaseError(error: unknown): string {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";
    return [code, message].filter(Boolean).join(": ").slice(0, 240);
  }
  return String(error).slice(0, 240);
}

export const purchaseService = {
  async getV6Products(): Promise<Partial<Record<keyof typeof V6_PRODUCT_IDS, PurchasesStoreProduct>>> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("먼저 로그인해 주세요.");
    await this.configure(uid);
    if (configuredForUid !== uid) throw new Error("결제 서비스를 연결하지 못했어요.");
    let products: PurchasesStoreProduct[] = [];
    try {
      const offerings = await Purchases.getOfferings();
      // Keep the existing default Offering for older app versions while the
      // new plans are tested. The v6 paywall reads its dedicated Offering.
      const v6Offering = offerings.all?.["ddok_v6"];
      products = v6Offering?.availablePackages?.map((pkg) => pkg.product) || [];
    } catch (error) {
      console.warn("[purchaseService] v6 offering lookup failed:", describePurchaseError(error));
    }
    if (Object.values(V6_PRODUCT_IDS).some((id) => !products.some((p) => p.identifier === id || p.identifier.startsWith(`${id}:`)))) {
      try {
        const direct = await Purchases.getProducts({ productIdentifiers: Object.values(V6_PRODUCT_IDS) });
        products = [...products, ...direct.products];
      } catch (error) {
        console.warn("[purchaseService] v6 direct lookup failed:", describePurchaseError(error));
      }
    }
    return Object.fromEntries(Object.entries(V6_PRODUCT_IDS).flatMap(([plan, id]) => {
      const product = products.find((p) => p.identifier === id || p.identifier.startsWith(`${id}:`));
      return product ? [[plan, product]] : [];
    })) as Partial<Record<keyof typeof V6_PRODUCT_IDS, PurchasesStoreProduct>>;
  },

  async purchaseV6Product(product: PurchasesStoreProduct): Promise<CustomerInfo> {
    const uid = auth.currentUser?.uid;
    if (!uid || configuredForUid !== uid) throw new Error("결제 계정을 확인해 주세요.");
    const info = (await Purchases.purchaseStoreProduct({ product })).customerInfo;
    // Force a server-side RevenueCat lookup so the new quota appears promptly.
    // The purchase itself is successful even if this follow-up check is delayed.
    await robustFetch("/api/usage/status?refresh=1").catch(() => {});
    return info;
  },
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

  hasActiveV6Entitlement(customerInfo: CustomerInfo): boolean {
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID] ||
      customerInfo.activeSubscriptions.some((subscriptionId) =>
        Object.values(V6_PRODUCT_IDS).some((productId) =>
          subscriptionId === productId || subscriptionId.startsWith(`${productId}:`)));
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
