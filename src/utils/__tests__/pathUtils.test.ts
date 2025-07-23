import { describe, it, expect } from "vitest";
import {
  normalizeProjectPath,
  getProjectDisplayName,
  isPathInHomeDirectory,
} from "../pathUtils";

describe("pathUtils", () => {
  describe("normalizeProjectPath", () => {
    it("should convert encoded path with dashes to forward slashes", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-tools-ClaudeCodeManager";
      const expected =
        "/Users/yasutaka/kawamoto/r0096/dev/tools/ClaudeCodeManager";
      expect(normalizeProjectPath(input)).toBe(expected);
    });

    it("should handle paths starting with Users", () => {
      const input = "Users-john-documents-projects";
      const expected = "/Users/john/documents/projects";
      expect(normalizeProjectPath(input)).toBe(expected);
    });

    it("should return empty string for empty input", () => {
      expect(normalizeProjectPath("")).toBe("");
    });

    it("should handle already normalized paths", () => {
      const input = "/Users/john/documents/projects";
      expect(normalizeProjectPath(input)).toBe(
        "/Users/john/documents/projects",
      );
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
    it("should return true for paths in Users directory", () => {
      const input =
        "-Users-yasutaka-kawamoto-r0096-dev-tools-ClaudeCodeManager";
      expect(isPathInHomeDirectory(input)).toBe(true);
    });

    it("should return false for paths not in Users directory", () => {
      const input = "var-www-html-project";
      expect(isPathInHomeDirectory(input)).toBe(false);
    });

    it("should handle already normalized home paths", () => {
      const input = "/Users/john/documents";
      expect(isPathInHomeDirectory(input)).toBe(true);
    });
  });
});
