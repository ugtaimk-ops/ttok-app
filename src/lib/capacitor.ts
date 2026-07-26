import { registerPlugin } from "@capacitor/core";

export interface AppSettingsPlugin {
  open(): Promise<{ success: boolean }>;
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
