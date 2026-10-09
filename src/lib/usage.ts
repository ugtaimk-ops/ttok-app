export const FREE_MONTHLY_LIMIT = 50;
export const PREMIUM_MONTHLY_LIMIT = 150;

export function getKoreanMonthKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not determine Korean billing month");
  return `${year}-${month}`;
}
