import { AppLauncher } from "@capacitor/app-launcher";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

export const TIMER_APP_URL = "ddoktimer://timer";
const TIMER_PACKAGE = "app.ddok.timer";
const TIMER_PLAY_URL = `https://play.google.com/store/apps/details?id=${TIMER_PACKAGE}`;
const TIMER_MODES = new Set(["countdown", "infinite", "pomodoro", "flip", "tree", "hourglass", "subject", "routine"]);

async function openTimerUrl(target: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    const devTarget = target === TIMER_APP_URL ? "" : target.startsWith(TIMER_APP_URL + "?") ? target.slice(TIMER_APP_URL.length) : target.startsWith("ddoktimer://detail?") ? target.slice("ddoktimer://detail".length) : "";
    window.open(import.meta.env.DEV ? "http://127.0.0.1:3002/" + devTarget : TIMER_PLAY_URL, "_blank", "noopener,noreferrer");
    return true;
  }
  try {
    const { value } = await AppLauncher.canOpenUrl({ url: target });
    if (value && (await AppLauncher.openUrl({ url: target })).completed) return true;
  } catch (error) {
    console.warn("Could not open the timer app:", error);
  }
  if (Capacitor.getPlatform() !== "android") return false;
  // The Play listing may not exist until the separate timer app is published.
  try {
    const result = await AppLauncher.openUrl({ url: `market://details?id=${TIMER_PACKAGE}` });
    if (result.completed) return true;
  } catch { /* Play Store app unavailable; open the HTTPS listing instead. */ }
  try {
    await Browser.open({ url: TIMER_PLAY_URL });
    return true;
  } catch (error) {
    console.warn("Could not open the timer store listing:", error);
    return false;
  }
}

export async function openTimerApp(goalId?:string): Promise<boolean> {
  const target = TIMER_APP_URL + (goalId ? '?goalId='+encodeURIComponent(goalId) : '');
  return openTimerUrl(target);
}

/** Opens a concrete timer type in the installed timer app. */
export async function openTimerDetail(itemId: string): Promise<boolean> {
  if (!TIMER_MODES.has(itemId)) return false;
  return openTimerUrl(`ddoktimer://detail?itemId=${encodeURIComponent(itemId)}`);
}
