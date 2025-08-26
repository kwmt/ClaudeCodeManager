import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatDateTime,
  getRelativeTime,
  formatDateTooltip,
  formatDateForContext,
  isToday,
  isYesterday,
} from "../dateUtils";

describe("dateUtils", () => {
  const mockDate = new Date(2024, 0, 15, 14, 30, 45); // Local time: 2024-01-15 14:30:45
  const mockNow = new Date(2024, 0, 15, 16, 0, 0); // Local time: 2024-01-15 16:00:00

  beforeEach(() => {
    // Mock Date.now to control "current time"
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatDateTime", () => {
    it("should format date in technical style by default", () => {
      const result = formatDateTime(mockDate);
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it("should format date in compact style", () => {
      const result = formatDateTime(mockDate, { style: "compact" });
      // Should include year, month/day indicators, and time with seconds
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
      expect(result.length).toBeGreaterThan(10); // Should be a reasonably long format
    });

    it("should format date in technical style", () => {
      const result = formatDateTime(mockDate, { style: "technical" });
      expect(result).toBe("2024-01-15 14:30:45");
    });

    it("should format time only", () => {
      const result = formatDateTime(mockDate, { style: "time-only" });
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}|\d{1,2}:\d{2}:\d{2} [AP]M/);
    });

    it("should include relative time when requested", () => {
      const result = formatDateTime(mockDate, { showRelative: true });
      expect(result).toContain("(1 hour ago)");
    });

    it("should handle invalid dates", () => {
      const result = formatDateTime("invalid-date");
      expect(result).toBe("Invalid date");
    });

    it("should handle string dates", () => {
      const result = formatDateTime("2024-01-15T14:30:45", {
        style: "technical",
      });
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
  });

  describe("getRelativeTime", () => {
    it('should show "Just now" for very recent times', () => {
      const recent = new Date(mockNow.getTime() - 5000); // 5 seconds ago
      const result = getRelativeTime(recent);
      expect(result).toBe("Just now");
    });

    it("should show minutes ago", () => {
      const minutesAgo = new Date(mockNow.getTime() - 5 * 60 * 1000); // 5 minutes ago
      const result = getRelativeTime(minutesAgo);
      expect(result).toBe("5 minutes ago");
    });

    it("should show hours ago", () => {
      const result = getRelativeTime(mockDate);
      expect(result).toBe("1 hour ago");
    });

    it('should show "Yesterday" for yesterday', () => {
      const yesterday = new Date(mockNow.getTime() - 24 * 60 * 60 * 1000);
      const result = getRelativeTime(yesterday);
      expect(result).toBe("Yesterday");
    });

    it("should show days ago", () => {
      const threeDaysAgo = new Date(
        mockNow.getTime() - 3 * 24 * 60 * 60 * 1000,
      );
      const result = getRelativeTime(threeDaysAgo);
      expect(result).toBe("3 days ago");
    });

    it("should show months ago for old dates", () => {
      const monthsAgo = new Date(mockNow.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days
      const result = getRelativeTime(monthsAgo);
      expect(result).toBe("2 months ago");
    });

    it("should handle future dates", () => {
      const future = new Date(mockNow.getTime() + 60 * 60 * 1000); // 1 hour in future
      const result = getRelativeTime(future);
      expect(result).toBe("in 1 hour");
    });
  });

  describe("formatDateTooltip", () => {
    it("should format full detailed date for tooltip", () => {
      const result = formatDateTooltip(mockDate);
      // Should contain day of week (either English or localized)
      expect(result).toMatch(
        /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日/,
      );
      // Should contain year and time
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("formatDateForContext", () => {
    it("should format for card context with relative time", () => {
      const result = formatDateForContext(mockDate, "card");
      expect(result).toContain("(1 hour ago)");
    });

    it("should format for list context with technical format", () => {
      const result = formatDateForContext(mockDate, "list");
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it("should format for log context with ISO format", () => {
      const result = formatDateForContext(mockDate, "log");
      expect(result).toMatch(/2024-01-15T\d{2}:30:45\.\d{3}Z/);
    });
  });

  describe("isToday", () => {
    it("should return true for today's date", () => {
      const today = new Date(
        mockNow.getFullYear(),
        mockNow.getMonth(),
        mockNow.getDate(),
        10,
        0,
        0,
      );
      expect(isToday(today)).toBe(true);
    });

    it("should return false for yesterday's date", () => {
      const yesterday = new Date(mockNow.getTime() - 24 * 60 * 60 * 1000);
      expect(isToday(yesterday)).toBe(false);
    });

    it("should handle string dates", () => {
      const todayString = mockNow.toISOString();
      expect(isToday(todayString)).toBe(true);
    });
  });

  describe("isYesterday", () => {
    it("should return true for yesterday's date", () => {
      const yesterday = new Date(mockNow.getTime() - 24 * 60 * 60 * 1000);
      expect(isYesterday(yesterday)).toBe(true);
    });

    it("should return false for today's date", () => {
      expect(isYesterday(mockNow)).toBe(false);
    });

    it("should return false for two days ago", () => {
      const twoDaysAgo = new Date(mockNow.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(isYesterday(twoDaysAgo)).toBe(false);
    });
  });
});
