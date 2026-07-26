import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { ScheduleItem } from '../types';
import { getApiUrl, logFetchFailure } from '../lib/api';

// Utility to format Date to YYYYMMDD
const formatDateToYMD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

// Clean HTML, allergy numbers, and format menu neatly
const cleanMenu = (menuStr: string): string => {
  return menuStr
    .replace(/\([^)]*\)/g, "") // Remove anything inside parentheses like (5.6.10.)
    .replace(/<br\s*\/?>/gi, ", ") // Replace <br/> with comma
    .replace(/\s+/g, " ") // Clean extra spaces
    .trim()
    .replace(/,\s*$/, ""); // Remove trailing comma if any
};

// Fetch upcoming meals from NEIS directly or via proxy
const fetchUpcomingMealsInService = async (
  officeCode: string,
  schoolCode: string,
  schoolName: string,
  startDate: string,
  endDate: string
): Promise<any[]> => {
  const directUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=100&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_FROM_YMD=${startDate}&MLSV_TO_YMD=${endDate}`;
  
  try {
    const response = await fetch(directUrl, { method: "GET" });
    if (response.ok) {
      const text = await response.text();
      const data = JSON.parse(text);
      if (data.mealServiceDietInfo && data.mealServiceDietInfo[1] && data.mealServiceDietInfo[1].row) {
        return data.mealServiceDietInfo[1].row.map((item: any) => ({
          mealType: item.MMEAL_SC_NM,
          date: item.MLSV_YMD,
          menu: item.DDISH_NM,
          calories: item.CAL_INFO
        }));
      }
    } else {
      let responseText = "";
      try {
        responseText = await response.text();
      } catch (readErr) {
        responseText = "[Failed to read response body]";
      }
      logFetchFailure(directUrl, new Error(`HTTP status is ${response.status}`), response.status, responseText);
    }
  } catch (e) {
    console.warn("[NotificationService] Direct NEIS fetch failed in service, trying proxy:", e);
    logFetchFailure(directUrl, e);
  }

  // Fallback to Express Proxy
  const proxyPath = `/api/meal/info?officeCode=${officeCode}&schoolCode=${schoolCode}&schoolName=${encodeURIComponent(schoolName)}&startDate=${startDate}&endDate=${endDate}`;
  const proxyUrl = getApiUrl(proxyPath);
  try {
    const proxyResponse = await fetch(proxyUrl);
    if (proxyResponse.ok) {
      return await proxyResponse.json();
    } else {
      let responseText = "";
      try {
        responseText = await proxyResponse.text();
      } catch (readErr) {
        responseText = "[Failed to read response body]";
      }
      logFetchFailure(proxyUrl, new Error(`HTTP status is ${proxyResponse.status}`), proxyResponse.status, responseText);
    }
  } catch (proxyError) {
    console.error("[NotificationService] Express Proxy fetch failed in service:", proxyError);
    logFetchFailure(proxyUrl, proxyError);
  }
  return [];
};

// Storage helper for unique notification IDs (maps a string key to a 32-bit unique integer)
const getNotificationId = (key: string): number => {
  const mapStr = localStorage.getItem("ttok_notification_id_map") || "{}";
  const idMap = JSON.parse(mapStr);
  if (idMap[key] !== undefined) {
    return idMap[key];
  }
  
  const counterStr = localStorage.getItem("ttok_notification_id_counter") || "1000";
  let counter = parseInt(counterStr, 10);
  counter += 1;
  
  idMap[key] = counter;
  localStorage.setItem("ttok_notification_id_map", JSON.stringify(idMap));
  localStorage.setItem("ttok_notification_id_counter", String(counter));
  
  return counter;
};

// Check and request permissions automatically
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    console.log("[NotificationService] Web environment - notification permissions default to true");
    return true;
  }
  try {
    const check = await LocalNotifications.checkPermissions();
    if (check.display === 'granted') {
      return true;
    }
    const request = await LocalNotifications.requestPermissions();
    return request.display === 'granted';
  } catch (error) {
    console.error('[NotificationService] Failed to request permissions:', error);
    return false;
  }
};

// Initialize notification listeners on app startup
export const initNotifications = (onNotificationClick: (data: any) => void) => {
  if (!Capacitor.isNativePlatform()) return;
  
  // Request permissions on launch
  requestNotificationPermission();

  // Clean listeners to prevent memory leaks and multiple triggers
  LocalNotifications.removeAllListeners();

  // Listener for when a notification is clicked/tapped
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    console.log('[NotificationService] Notification clicked:', action);
    const extra = action.notification.extra;
    if (extra) {
      onNotificationClick(extra);
    }
  });
};

// Main function to synchronize all scheduled notifications with the Capacitor engine
export const syncAllNotifications = async (schedules?: ScheduleItem[]) => {
  if (!Capacitor.isNativePlatform()) {
    console.log("[NotificationService] Web environment - simulating sync of scheduled notifications");
    return;
  }

  try {
    // 1. Request/Ensure permissions are granted
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn("[NotificationService] Notification permission is not granted. Skipping scheduling.");
      return;
    }

    // 2. Fetch and cancel all currently pending notifications to avoid duplicates and desync
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map(n => ({ id: n.id }))
      });
      console.log(`[NotificationService] Cancelled ${pending.notifications.length} existing pending notifications`);
    }

    // Load schedules fallback
    let activeSchedules = schedules;
    if (!activeSchedules) {
      const saved = localStorage.getItem("ttok_schedules");
      activeSchedules = saved ? JSON.parse(saved) : [];
    }

    // 3. Retrieve notification settings from localStorage
    const examNotifSaved = localStorage.getItem("ttok_exam_notif");
    const examNotif = examNotifSaved !== null ? examNotifSaved === "true" : true;

    const assessNotifSaved = localStorage.getItem("ttok_assess_notif");
    const assessNotif = assessNotifSaved !== null ? assessNotifSaved === "true" : true;

    const dailyNotifSaved = localStorage.getItem("ttok_daily_notif");
    const dailyNotif = dailyNotifSaved !== null ? dailyNotifSaved === "true" : false;

    // Kkorureuk (Meal) notification settings
    const mealNotifSaved = localStorage.getItem("ttok_meal_notif_enabled");
    const mealNotifEnabled = mealNotifSaved !== null ? mealNotifSaved === "true" : true;
    const mealNotifHour = parseInt(localStorage.getItem("ttok_meal_notif_hour") || "8", 10);
    const mealNotifMinute = parseInt(localStorage.getItem("ttok_meal_notif_minute") || "20", 10);

    const userProfileStr = localStorage.getItem("ttok_user_profile");
    const user = userProfileStr ? JSON.parse(userProfileStr) : null;

    const notificationsToSchedule: LocalNotificationSchema[] = [];
    const now = Date.now();

    // 4. Schedule exam and assessment alarms based on user's schedules
    activeSchedules.forEach(item => {
      if (!item.date) return;

      const [year, month, day] = item.date.split("-").map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return;

      // Base event date at 9:00 AM (local time)
      const baseDate = new Date(year, month - 1, day, 9, 0, 0, 0);

      if (item.type === "exam" && examNotif) {
        // Exam Notification rules: 7 days before, 5 days before, 3 days before, 1 day before
        const offsets = [7, 5, 3, 1];
        offsets.forEach(days => {
          const targetDate = new Date(baseDate.getTime());
          targetDate.setDate(targetDate.getDate() - days);

          if (targetDate.getTime() > now) {
            const idKey = `sc_${item.id}_exam_${days}`;
            const notificationId = getNotificationId(idKey);

            notificationsToSchedule.push({
              id: notificationId,
              title: `📅 시험 일정 알림 [${item.subject}]`,
              body: `${item.title} 시험이 ${days}일 남았습니다. 준비물: ${item.supplies || '필기도구'}. 열심히 준비해봐요!`,
              schedule: {
                at: targetDate,
                allowWhileIdle: true,
              },
              extra: {
                tab: "assessment",
                scheduleId: item.id
              }
            });
          }
        });
      } else if (item.type === "assessment" && assessNotif) {
        // Assessment/Task Notification rule: 1 day before
        const targetDate = new Date(baseDate.getTime());
        targetDate.setDate(targetDate.getDate() - 1);

        if (targetDate.getTime() > now) {
          const idKey = `sc_${item.id}_assess_1`;
          const notificationId = getNotificationId(idKey);

          notificationsToSchedule.push({
            id: notificationId,
            title: `📝 수행평가 제출 알림 [${item.subject}]`,
            body: `내일은 [${item.title}] 수행평가 제출 마감일입니다. 마감 정보와 준비물(${item.supplies || '없음'})을 미리 준비하세요!`,
            schedule: {
              at: targetDate,
              allowWhileIdle: true,
            },
            extra: {
              tab: "assessment",
              scheduleId: item.id
            }
          });
        }
      }
    });

    // 5. Schedule AI Daily Recommendation notification (Daily at 19:00 / 7:00 PM)
    if (dailyNotif) {
      const dailyId = getNotificationId("daily_ai_recommendation");
      notificationsToSchedule.push({
        id: dailyId,
        title: `🤖 똑 AI 학습 비서`,
        body: `오늘 하루도 수고하셨어요! 내일 스케줄을 완벽 분석한 맞춤형 학습 추천 피드백이 도착했습니다.`,
        schedule: {
          on: {
            hour: 19,
            minute: 0
          },
          repeats: true,
          allowWhileIdle: true,
        },
        extra: {
          tab: "study"
        }
      });
    }

    // 6. Schedule Meal (꼬르륵) Notifications
    if (mealNotifEnabled && user && user.schoolCode && user.officeCode) {
      console.log(`[NotificationService] Syncing meal notifications for ${user.school} at ${mealNotifHour}:${mealNotifMinute}`);
      const today = new Date();
      const after7Days = new Date();
      after7Days.setDate(today.getDate() + 6);
      const startYMD = formatDateToYMD(today);
      const endYMD = formatDateToYMD(after7Days);

      try {
        const meals = await fetchUpcomingMealsInService(
          user.officeCode,
          user.schoolCode,
          user.school,
          startYMD,
          endYMD
        );

        if (meals && meals.length > 0) {
          // Group by date
          const mealsByDate: { [date: string]: { type: string, menu: string }[] } = {};
          meals.forEach((m: any) => {
            if (!m.date) return;
            if (!mealsByDate[m.date]) {
              mealsByDate[m.date] = [];
            }
            mealsByDate[m.date].push({ type: m.mealType, menu: m.menu });
          });

          // Schedule for each date
          Object.keys(mealsByDate).forEach(dateStr => {
            const year = parseInt(dateStr.substring(0, 4), 10);
            const month = parseInt(dateStr.substring(4, 6), 10);
            const day = parseInt(dateStr.substring(6, 8), 10);

            const targetDate = new Date(year, month - 1, day, mealNotifHour, mealNotifMinute, 0, 0);
            if (targetDate.getTime() > now) {
              const idKey = `meal_alarm_${dateStr}`;
              const notificationId = getNotificationId(idKey);
              
              const dayMeals = mealsByDate[dateStr];
              const bodyParts = dayMeals.map(dm => `[${dm.type}] ${cleanMenu(dm.menu)}`);
              const bodyText = bodyParts.join(" | ");

              notificationsToSchedule.push({
                id: notificationId,
                title: `😋 오늘의 급식 메뉴 [${user.school}]`,
                body: bodyText,
                schedule: {
                  at: targetDate,
                  allowWhileIdle: true,
                },
                extra: {
                  tab: "meal-today",
                  serviceMode: "kkorureuk"
                }
              });
            }
          });
          console.log(`[NotificationService] Scheduled ${Object.keys(mealsByDate).length} specific meal menu alarms`);
        } else {
          // No meals returned, schedule a daily repeating fallback alarm
          console.log("[NotificationService] No meals returned from NEIS, scheduling repeating fallback alarm.");
          const fallbackId = getNotificationId("meal_alarm_repeating_fallback");
          notificationsToSchedule.push({
            id: fallbackId,
            title: `😋 오늘 급식 확인하기`,
            body: `오늘의 맛있는 급식 메뉴와 칼로리 정보를 확인해 보세요! 영양 성분 및 알레르기 유발물질 정보도 똑에서 제공됩니다.`,
            schedule: {
              on: {
                hour: mealNotifHour,
                minute: mealNotifMinute
              },
              repeats: true,
              allowWhileIdle: true,
            },
            extra: {
              tab: "meal-today",
              serviceMode: "kkorureuk"
            }
          });
        }
      } catch (mealErr) {
        console.error("[NotificationService] Failed to schedule specific meal alarms, scheduling repeating fallback:", mealErr);
        const fallbackId = getNotificationId("meal_alarm_repeating_fallback");
        notificationsToSchedule.push({
          id: fallbackId,
          title: `😋 오늘 급식 확인하기`,
          body: `오늘의 맛있는 급식 메뉴와 칼로리 정보를 확인해 보세요! 영양 성분 및 알레르기 유발물질 정보도 똑에서 제공됩니다.`,
          schedule: {
            on: {
              hour: mealNotifHour,
              minute: mealNotifMinute
            },
            repeats: true,
            allowWhileIdle: true,
          },
          extra: {
            tab: "meal-today",
            serviceMode: "kkorureuk"
          }
        });
      }
    }

    // 7. Push all notifications to the Capacitor LocalNotifications engine
    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({
        notifications: notificationsToSchedule
      });
      console.log(`[NotificationService] Successfully synchronized & scheduled ${notificationsToSchedule.length} notifications`);
    } else {
      console.log("[NotificationService] No notifications to schedule based on active data and settings.");
    }
  } catch (error) {
    console.error("[NotificationService] Error synchronizing local notifications:", error);
  }
};
