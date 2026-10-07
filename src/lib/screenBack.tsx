import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

const ActiveScreen = createContext(true);
const handlers = new Map<symbol, { priority: number; run: () => boolean }>();

export function ScreenScope({ active, children }: { active: boolean; children: ReactNode }) {
  return <ActiveScreen.Provider value={active}><div className={active ? "" : "hidden"}>{children}</div></ActiveScreen.Provider>;
}

// Hidden tabs stay mounted, but must never intercept another screen's back.
export function useScreenBack(handler: () => boolean, enabled = true, priority = 0) {
  const active = useContext(ActiveScreen);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active || !enabled) return;
    const key = Symbol();
    handlers.set(key, { priority, run: () => latest.current() });
    return () => { handlers.delete(key); };
  }, [active, enabled, priority]);
}

export function handleScreenBack(): boolean {
  for (const handler of [...handlers.values()].reverse().sort((a, b) => b.priority - a.priority)) {
    if (handler.run()) return true;
  }
  return false;
}
