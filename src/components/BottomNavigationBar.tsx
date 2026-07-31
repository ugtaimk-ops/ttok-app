import {
  Home,
  Calendar,
  Video,
  BookOpen,
  User,
  Settings,
  Utensils,
  CalendarDays,
  Search
} from "lucide-react";
import { motion } from "motion/react";

interface BottomNavigationBarProps {
  currentTab: string;
  onChangeTab: (tab: string) => void;
  darkMode: boolean;
  serviceMode: "tok" | "kkorureuk";
}

export default function BottomNavigationBar({ 
  currentTab, 
  onChangeTab, 
  darkMode,
  serviceMode
}: BottomNavigationBarProps) {
  
  const tokTabs = [
    { id: "home", label: "홈", icon: Home },
    { id: "assessment", label: "수행평가", icon: Calendar },
    { id: "practice", label: "발표연습", icon: Video },
    { id: "study", label: "공부", icon: BookOpen },
    { id: "profile", label: "프로필", icon: User },
    { id: "settings", label: "설정", icon: Settings },
  ];

  const kkorureukTabs = [
    { id: "meal-today", label: "오늘 급식", icon: Utensils },
    { id: "meal-weekly", label: "이번 주 급식", icon: CalendarDays },
    { id: "meal-school", label: "학교 설정", icon: Search },
  ];

  const tabs = serviceMode === "tok" ? tokTabs : kkorureukTabs;

  return (
    <>
      {/* SVG Liquid Gooey Filter for iOS 27 Liquid Style Navigation */}
      <svg className="absolute w-0 h-0" width="0" height="0">
        <defs>
          <filter id="gooey-nav">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-1.25rem)] xs:w-[calc(100%-2rem)] sm:w-[calc(100%-2.5rem)] max-w-2xl h-16 sm:h-20 z-45">
        <div className={`w-full h-full relative border flex items-center justify-around px-1 xs:px-2 sm:px-4 md:px-6 overflow-visible transition-all duration-300 ${
          darkMode 
            ? "bg-slate-950/10 border-slate-800/40 backdrop-blur-3xl shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05),0_20px_50px_rgba(0,0,0,0.5)]" 
            : "bg-white/10 border-white/50 backdrop-blur-3xl shadow-[inset_0_1.5px_3px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.4),0_20px_50px_rgba(15,23,42,0.12)]"
        } rounded-[32px] sm:rounded-[44px]`}>
          
          {/* Glass reflection shine overlay */}
          <div className="absolute inset-0 rounded-[32px] sm:rounded-[44px] bg-gradient-to-b from-white/12 via-white/2 to-transparent pointer-events-none z-5" />
          
          {/* Gooey Liquid Background Layer */}
          <div 
            className="absolute inset-0 pointer-events-none px-1 xs:px-2 sm:px-4 md:px-6 flex items-center justify-around overflow-visible z-0"
            style={{ filter: "url(#gooey-nav)" }}
          >
            {tabs.map((tab) => {
              const isActive = currentTab === tab.id;
              return (
                <div key={tab.id} className="w-12 xs:w-13 sm:w-16 h-13 xs:h-14 sm:h-16 flex items-center justify-center relative overflow-visible">
                  {/* Subtle liquid base/droplet under every tab */}
                  <div className={`w-2 h-2 xs:w-3.5 sm:w-4 h-2 xs:h-3.5 sm:h-4 rounded-full transition-colors duration-300 ${
                    isActive ? "bg-brand scale-125" : "bg-brand/20 dark:bg-brand/35"
                  }`} />
                  
                  {/* Sliding active liquid bubble droplet */}
                  {isActive && (
                    <motion.div
                      layoutId="liquidActiveBubble"
                      className="absolute w-[42px] xs:w-[46px] sm:w-[58px] h-[46px] xs:h-[50px] sm:h-[58px] rounded-[14px] xs:rounded-[16px] sm:rounded-[22px] bg-brand shadow-lg shadow-brand/30"
                      transition={{
                        type: "spring",
                        stiffness: 140,
                        damping: 15,
                        mass: 0.8
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
 
          {/* Crisp Foreground Interactive Icons */}
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = currentTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onChangeTab(tab.id)}
                className="relative flex items-center justify-center focus:outline-none cursor-pointer group transition-all z-10 w-12 xs:w-13 sm:w-16 h-13 xs:h-14 sm:h-16"
                id={`tab-button-${tab.id}`}
                title={tab.label}
              >
                <div className={`w-9 xs:w-10 sm:w-[46px] h-9 xs:h-10 sm:h-[46px] rounded-lg sm:rounded-xl flex items-center justify-center transition-all ${
                  isActive 
                    ? "text-white scale-105" 
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}>
                  <IconComponent 
                    size={undefined}
                    className={`w-[23px] h-[23px] xs:w-[25px] xs:h-[25px] sm:w-[28px] sm:h-[28px] transition-transform duration-200 ${
                      isActive 
                        ? "stroke-[2.5px] scale-110" 
                        : "stroke-[2px] opacity-70 group-hover:opacity-100 group-hover:scale-110"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
