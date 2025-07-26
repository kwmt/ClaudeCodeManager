import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeProjectPathSync,
  setPathMappingCache,
  setHomeDirCache,
  getProjectDisplayName,
  isPathInHomeDirectory,
} from "../pathUtils";

describe("pathUtils", () => {
  beforeEach(() => {
    // Set up path mapping cache with correct mappings
    setPathMappingCache({
      "-Users-yasutaka-kawamoto-r0096-dev-tools-ClaudeCodeManager":
        "/Users/yasutaka.kawamoto_r0096/dev/tools/ClaudeCodeManager",
      "-Users-yasutaka-kawamoto-r0096-dev-lips-android-LIPS-Android":
        "/Users/yasutaka.kawamoto_r0096/dev/lips/android/LIPS-Android",
      "-Users-yasutaka-kawamoto-r0096-dev-lips-frontend-facetype-analysis-sdk":
        "/Users/yasutaka.kawamoto_r0096/dev/lips/frontend/facetype-analysis-sdk",
      "-Users-yasutaka-kawamoto-r0096-dev-lips-frontend-make-frontend":
        "/Users/yasutaka.kawamoto_r0096/dev/lips/frontend/make-frontend",
      "-Users-john-smith-123-documents-projects":
        "/Users/john.smith_123/documents/projects",
    });

    // Set up home directory cache
    setHomeDirCache("/Users/yasutaka.kawamoto_r0096");
  });

  describe("normalizeProjectPath", () => {
    it("should use CWD-based mapping to normalize encoded paths", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-tools-ClaudeCodeManager";
      const expected =
        "/Users/yasutaka.kawamoto_r0096/dev/tools/ClaudeCodeManager";
      expect(normalizeProjectPathSync(input)).toBe(expected);
    });

    it("should handle compound directory names using CWD mapping", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-lips-android-LIPS-Android";
      const expected =
        "/Users/yasutaka.kawamoto_r0096/dev/lips/android/LIPS-Android";
      expect(normalizeProjectPathSync(input)).toBe(expected);
    });

    it("should handle user paths with CWD mapping", () => {
      const input = "-Users-john-smith-123-documents-projects";
      const expected = "/Users/john.smith_123/documents/projects";
      expect(normalizeProjectPathSync(input)).toBe(expected);
    });

    it("should return empty string for empty input", () => {
      expect(normalizeProjectPathSync("")).toBe("");
    });

    it("should handle already normalized paths", () => {
      const input = "/Users/john/documents/projects";
      expect(normalizeProjectPathSync(input)).toBe(
        "/Users/john/documents/projects",
      );
    });

    it("should use CWD mapping regardless of known paths parameter", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-lips-android-LIPS-Android";
      const knownPaths = [
        "-Users-yasutaka-kawamoto-r0096-dev-lips-android-LIPS-Android",
        "-Users-yasutaka-kawamoto-r0096-dev-tools-ClaudeCodeManager",
      ];
      const expected =
        "/Users/yasutaka.kawamoto_r0096/dev/lips/android/LIPS-Android";
      expect(normalizeProjectPathSync(input, knownPaths)).toBe(expected);
    });

    it("should handle facetype-analysis-sdk using CWD mapping", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-lips-frontend-facetype-analysis-sdk";
      const knownPaths = [
        "-Users-yasutaka-kawamoto-r0096-dev-lips-frontend-facetype-analysis-sdk",
        "-Users-yasutaka-kawamoto-r0096-dev-lips-android-LIPS-Android",
      ];
      const expected =
        "/Users/yasutaka.kawamoto_r0096/dev/lips/frontend/facetype-analysis-sdk";
      expect(normalizeProjectPathSync(input, knownPaths)).toBe(expected);
    });

    it("should handle make-frontend using CWD mapping", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-lips-frontend-make-frontend";
      const expected =
        "/Users/yasutaka.kawamoto_r0096/dev/lips/frontend/make-frontend";
      expect(normalizeProjectPathSync(input)).toBe(expected);
    });

    it("should fall back to simple dash replacement when path not in cache", () => {
      const input = "-some-unknown-path-not-in-cache";
      const expected = "/some/unknown/path/not/in/cache";
      expect(normalizeProjectPathSync(input)).toBe(expected);
    });
  });

  describe("getProjectDisplayName", () => {
    it("should return the last segment of the path", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-tools-ClaudeCodeManager";
      const expected = "ClaudeCodeManager";
      expect(getProjectDisplayName(input)).toBe(expected);
    });

    it("should handle simple project names", () => {
      const input = "my-project";
      const expected = "project";
      expect(getProjectDisplayName(input)).toBe(expected);
    });

    it("should return the full path if no segments", () => {
      const input = "project";
      expect(getProjectDisplayName(input)).toBe("project");
    });
  });

  describe("isPathInHomeDirectory", () => {
    it("should return true for paths in current user's home directory", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-tools-ClaudeCodeManager";
      expect(isPathInHomeDirectory(input)).toBe(true);
    });

    it("should return false for paths not in home directory", () => {
      const input = "var-www-html-project";
      expect(isPathInHomeDirectory(input)).toBe(false);
    });

    it("should handle already normalized home paths", () => {
      const input = "/Users/yasutaka.kawamoto_r0096/documents";
      expect(isPathInHomeDirectory(input)).toBe(true);
    });

    it("should return false for other users' home directories", () => {
      const input = "/Users/john/documents";
      expect(isPathInHomeDirectory(input)).toBe(false);
    });
  });
});
