/**
 * Date formatting utilities for consistent timestamp display across the application
 * Provides both absolute timestamps with seconds precision and relative time context
 */

export interface DateFormatOptions {
  /** Show relative time alongside absolute time */
  showRelative?: boolean;
  /** Format style: 'full' | 'compact' | 'technical' | 'time-only' (default: 'technical') */
  style?: "full" | "compact" | "technical" | "time-only";
  /** Locale for internationalization (defaults to system locale) */
  locale?: string;
  /** Timezone (defaults to local timezone) */
  timezone?: string;
}

/**
 * Formats a date with seconds precision in various styles
 * @param date - Date string or Date object to format
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDateTime(
  date: string | Date,
  options: DateFormatOptions = {},
): string {
  const {
    showRelative = false,
    style = "technical",
    locale = undefined,
    timezone = undefined,
  } = options;

  // Handle null/undefined dates
  if (!date) {
    return "No date";
  }

  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Handle invalid dates
  if (isNaN(dateObj.getTime())) {
    return "Invalid date";
  }

  let formatted = "";

  switch (style) {
    case "full":
      formatted = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: timezone,
      }).format(dateObj);
      break;

    case "compact":
      formatted = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: timezone,
      }).format(dateObj);
      break;

    case "technical":
      // Local time format with seconds (YYYY-MM-DD HH:MM:SS)
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const day = String(dateObj.getDate()).padStart(2, "0");
      const hours = String(dateObj.getHours()).padStart(2, "0");
      const minutes = String(dateObj.getMinutes()).padStart(2, "0");
      const seconds = String(dateObj.getSeconds()).padStart(2, "0");
      formatted = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      break;

    case "time-only":
      formatted = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: timezone,
      }).format(dateObj);
      break;

    default:
      // Default technical format - ISO 8601-like format that's consistent across locales
      formatted = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")} ${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}:${String(dateObj.getSeconds()).padStart(2, "0")}`;
  }

  if (showRelative) {
    const relative = getRelativeTime(dateObj);
    formatted = `${formatted} (${relative})`;
  }

  return formatted;
}

/**
 * Gets relative time string (e.g., "2 hours ago", "in 5 minutes")
 * @param date - Date to compare against current time
 * @returns Relative time string
 */
export function getRelativeTime(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Future dates
  if (diffMs < 0) {
    const futureDiffMs = Math.abs(diffMs);
    const futureDiffMins = Math.floor(futureDiffMs / 60000);
    const futureDiffHours = Math.floor(futureDiffMins / 60);
    const futureDiffDays = Math.floor(futureDiffHours / 24);

    if (futureDiffDays > 0) {
      return `in ${futureDiffDays} day${futureDiffDays !== 1 ? "s" : ""}`;
    }
    if (futureDiffHours > 0) {
      return `in ${futureDiffHours} hour${futureDiffHours !== 1 ? "s" : ""}`;
    }
    if (futureDiffMins > 0) {
      return `in ${futureDiffMins} minute${futureDiffMins !== 1 ? "s" : ""}`;
    }
    return "in a few seconds";
  }

  // Past dates
  if (diffDays > 30) {
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
  }
  if (diffDays > 0) {
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  }
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  }
  if (diffSecs > 10) {
    return `${diffSecs} seconds ago`;
  }

  return "Just now";
}

/**
 * Formats a date for display in a tooltip (full detail)
 * @param date - Date to format
 * @param locale - Locale for formatting
 * @returns Full formatted date string
 */
export function formatDateTooltip(
  date: string | Date,
  locale?: string,
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(dateObj);
}

/**
 * Groups dates by day for list displays
 * @param dates - Array of dates to group
 * @returns Grouped dates with day headers
 */
export function groupDatesByDay(dates: Date[]): Map<string, Date[]> {
  const groups = new Map<string, Date[]>();

  dates.forEach((date) => {
    const dayKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
    if (!groups.has(dayKey)) {
      groups.set(dayKey, []);
    }
    groups.get(dayKey)!.push(date);
  });

  return groups;
}

/**
 * Checks if a date is today
 * @param date - Date to check
 * @returns true if the date is today
 */
export function isToday(date: string | Date): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const today = new Date();

  return dateObj.toDateString() === today.toDateString();
}

/**
 * Checks if a date is yesterday
 * @param date - Date to check
 * @returns true if the date is yesterday
 */
export function isYesterday(date: string | Date): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return dateObj.toDateString() === yesterday.toDateString();
}

/**
 * Gets a user-friendly date format for different contexts
 * @param date - Date to format
 * @param context - Usage context: 'card' | 'list' | 'detail' | 'log'
 * @returns Formatted date string appropriate for the context
 */
export function formatDateForContext(
  date: string | Date,
  context: "card" | "list" | "detail" | "log",
): string {
  switch (context) {
    case "card":
      // Compact with relative time for cards
      return formatDateTime(date, { style: "compact", showRelative: true });

    case "list":
      // Technical format for lists (sortable, scannable)
      return formatDateTime(date, { style: "technical" });

    case "detail":
      // Full format for detail views
      return formatDateTime(date, { style: "full" });

    case "log":
      // ISO format for logs
      return new Date(date).toISOString();

    default:
      return formatDateTime(date);
  }
}
