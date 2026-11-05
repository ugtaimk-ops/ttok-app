import {
  Home,
  Calendar,
  Video,
  BookOpen,
  Menu,
  Utensils,
  CalendarDays,
  Search,
} from "lucide-react";
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

interface BottomNavigationBarProps {
  currentTab: string;
  onChangeTab: (tab: string) => void;
  darkMode: boolean;
  serviceMode: "tok" | "kkorureuk";
}

const tokTabs = [
  { id: "home", label: "홈", icon: Home },
  { id: "assessment", label: "수행평가", icon: Calendar },
  { id: "practice", label: "발표연습", icon: Video },
  { id: "study", label: "공부", icon: BookOpen },
  { id: "settings", label: "메뉴", icon: Menu },
];

const kkorureukTabs = [
  { id: "meal-today", label: "오늘 급식", icon: Utensils },
  { id: "meal-weekly", label: "이번 주 급식", icon: CalendarDays },
  { id: "meal-school", label: "학교 설정", icon: Search },
];

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  cancelled: boolean;
};

type TabCenter = { id: string; x: number };

export default function BottomNavigationBar({
  currentTab,
  onChangeTab,
  darkMode,
  serviceMode,
}: BottomNavigationBarProps) {
  const tabs = serviceMode === "tok" ? tokTabs : kkorureukTabs;
  const navRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const centersRef = useRef<TabCenter[]>([]);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  const [previewTab, setPreviewTab] = useState<string | null>(null);
  const [measured, setMeasured] = useState(false);
  const [navWidth, setNavWidth] = useState(0);
  const [tabCenters, setTabCenters] = useState<TabCenter[]>([]);
  const showLens = measured || previewTab !== null;
  const prefersReducedMotion = useReducedMotion();
  const targetX = useMotionValue(0);
  const targetStretch = useMotionValue(1);
  const lensX = useSpring(targetX, {
    stiffness: prefersReducedMotion ? 1500 : 480,
    damping: prefersReducedMotion ? 100 : 38,
    mass: 0.72,
  });
  const lensStretch = useSpring(targetStretch, {
    stiffness: 420,
    damping: 32,
  });
  const displayedX = prefersReducedMotion ? targetX : lensX;
  const contentX = useTransform(displayedX, (x) => -x);

  useMotionValueEvent(displayedX, "change", (x) => {
    const nav = navRef.current;
    if (!nav) return;
    const lensWidth = lensRef.current?.offsetWidth ?? 48;
    nav.style.setProperty("--glass-lens-center", `${x + lensWidth / 2}px`);
    nav.style.setProperty("--glass-lens-radius", `${lensWidth / 2 + 2}px`);
  });

  const positionFor = (center: number) =>
    center - (lensRef.current?.offsetWidth ?? 48) / 2;

  const nearestTab = (x: number) => centersRef.current.reduce<TabCenter | null>(
    (nearest, tab) => !nearest || Math.abs(tab.x - x) < Math.abs(nearest.x - x) ? tab : nearest,
    null,
  );

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const navBounds = nav.getBoundingClientRect();
      centersRef.current = Array.from(nav.querySelectorAll<HTMLButtonElement>("button[data-nav-tab]"))
        .map((button) => ({
          id: button.dataset.navTab!,
          x: button.getBoundingClientRect().left - navBounds.left + button.getBoundingClientRect().width / 2,
        }));
      setTabCenters(centersRef.current);
      setNavWidth(navBounds.width);
      const active = centersRef.current.find((tab) => tab.id === currentTab);
      if (active && !gestureRef.current?.dragging) targetX.set(positionFor(active.x));
      const lensWidth = lensRef.current?.offsetWidth ?? 48;
      nav.style.setProperty("--glass-lens-center", `${displayedX.get() + lensWidth / 2}px`);
      nav.style.setProperty("--glass-lens-radius", `${lensWidth / 2 + 2}px`);
      setMeasured(Boolean(active));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [currentTab, serviceMode, targetX, displayedX]);

  const moveLensToTab = (tabId: string) => {
    const center = centersRef.current.find((tab) => tab.id === tabId);
    if (center) targetX.set(positionFor(center.x));
    targetStretch.set(1);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      cancelled: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      gesture.cancelled = true;
      return;
    }
    if (!gesture.dragging && Math.abs(dx) < 7) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const nav = navRef.current;
    const centers = centersRef.current;
    if (!nav || !centers.length) return;
    const pointerX = event.clientX - nav.getBoundingClientRect().left;
    const clampedX = Math.max(centers[0].x, Math.min(centers[centers.length - 1].x, pointerX));
    targetX.set(positionFor(clampedX));
    targetStretch.set(prefersReducedMotion ? 1 : 1 + Math.min(0.16, Math.abs(dx) / 450));
    const nearest = nearestTab(clampedX);
    if (nearest) setPreviewTab((previous) => previous === nearest.id ? previous : nearest.id);
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.dragging) {
      event.preventDefault();
      suppressClickUntil.current = performance.now() + 400;
      const nav = navRef.current;
      const pointerX = nav ? event.clientX - nav.getBoundingClientRect().left : 0;
      const target = cancelled ? null : nearestTab(pointerX);
      const nextTab = target?.id ?? currentTab;
      moveLensToTab(nextTab);
      if (nextTab !== currentTab) onChangeTab(nextTab);
    } else {
      moveLensToTab(currentTab);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;
    setPreviewTab(null);
  };

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-1.25rem)] xs:w-[calc(100%-2rem)] sm:w-[calc(100%-2.5rem)] max-w-2xl h-16 sm:h-20 z-45">
      <div
        ref={navRef}
        data-ui="nav-bar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endGesture(event, false)}
        onPointerCancel={(event) => endGesture(event, true)}
        style={{ touchAction: "pan-y" }}
        className={`glass-nav-shell relative isolate flex h-full w-full items-center justify-around overflow-hidden rounded-[32px] px-1 xs:px-2 sm:rounded-[44px] sm:px-4 md:px-6 ${darkMode ? "glass-nav-shell-dark" : ""}`}
      >
        <motion.div
          ref={lensRef}
          aria-hidden="true"
          className={`glass-nav-lens pointer-events-none absolute left-0 top-1/2 z-20 h-13 w-12 xs:h-14 xs:w-13 sm:h-16 sm:w-16 ${darkMode ? "glass-nav-lens-dark" : ""}`}
          style={{
            x: displayedX,
            y: "-50%",
            opacity: showLens ? 1 : 0,
          }}
        >
          <motion.div className="glass-nav-lens-surface" style={{ scaleX: prefersReducedMotion ? targetStretch : lensStretch }} />
          <motion.div className="absolute inset-y-0 left-0" style={{ x: contentX, width: navWidth }}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const center = tabCenters.find((item) => item.id === tab.id);
              if (!center) return null;
              const isActive = (previewTab ?? currentTab) === tab.id;
              return (
                <Icon
                  key={tab.id}
                  className={`glass-nav-magnified-icon absolute top-1/2 h-[23px] w-[23px] xs:h-[25px] xs:w-[25px] sm:h-[28px] sm:w-[28px] ${isActive ? "text-slate-950 dark:text-white stroke-[2.5px]" : "text-slate-500 dark:text-slate-300 stroke-[2px]"}`}
                  style={{ left: center.x }}
                />
              );
            })}
          </motion.div>
        </motion.div>
        <div className={`${showLens ? "glass-nav-buttons " : ""}absolute inset-0 z-10 flex items-center justify-around px-1 xs:px-2 sm:px-4 md:px-6`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = (previewTab ?? currentTab) === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-ui={`nav-${tab.id}`}
              data-nav-tab={tab.id}
              id={`tab-button-${tab.id}`}
              title={tab.label}
              aria-label={tab.label}
              aria-current={currentTab === tab.id ? "page" : undefined}
              onClick={() => {
                if (performance.now() < suppressClickUntil.current) return;
                moveLensToTab(tab.id);
                onChangeTab(tab.id);
              }}
              className={`group relative z-10 flex h-13 w-12 cursor-pointer items-center justify-center rounded-[20px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 xs:h-14 xs:w-13 sm:h-16 sm:w-16 dark:focus-visible:outline-white ${
                isActive ? "text-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`h-[23px] w-[23px] xs:h-[25px] xs:w-[25px] sm:h-[28px] sm:w-[28px] ${isActive ? "stroke-[2.5px]" : "stroke-[2px] opacity-80 group-hover:opacity-100"}`}
              />
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
