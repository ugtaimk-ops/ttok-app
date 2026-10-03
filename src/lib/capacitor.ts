import { registerPlugin } from "@capacitor/core";

export interface AppSettingsPlugin {
  open(): Promise<{ success: boolean }>;
  getAppInfo(): Promise<{
    packageName: string;
    versionName: string;
    versionCode: number;
    signingSha1: string[];
    installer: string;
  }>;
}

export const AppSettings = registerPlugin<AppSettingsPlugin>("AppSettings");

/**
 * Checks if the application is currently running as a Capacitor native app.
 */
export function isNativeApp(): boolean {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.protocol === "file:" ||
    !!(window as any).Capacitor
  );
}

/**
 * One-line description of the running install (package, version, signing
 * certificate SHA-1, installer) for diagnosing sign-in / billing problems
 * that depend on exactly how the app was signed and distributed.
 */
export async function getAppDiagnostics(): Promise<string | null> {
  try {
    const info = await AppSettings.getAppInfo();
    return `pkg=${info.packageName} v${info.versionName}(${info.versionCode}) installer=${info.installer} SHA1=${info.signingSha1.join(",")}`;
  } catch {
    return null;
  }
}

/**
 * Native settings action
 */
export async function openNativeSettings(): Promise<boolean> {
  try {
    const result = await AppSettings.open();
    return result.success;
  } catch (err) {
    console.error("Failed to open native settings:", err);
    return false;
  }
}
