// Setup file for Vitest
import { vi } from "vitest";

// Mock navigator.clipboard globally with more aggressive approach
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(""),
};

// Create a new navigator object that includes clipboard
Object.defineProperty(window, "navigator", {
  value: {
    ...navigator,
    clipboard: mockClipboard,
  },
  configurable: true,
  writable: true,
});

// Also try direct assignment for older environments
try {
  Object.defineProperty(navigator, "clipboard", {
    value: mockClipboard,
    writable: true,
    configurable: true,
  });
} catch (e) {
  // Fallback for environments where navigator.clipboard is not configurable
  (navigator as any).clipboard = mockClipboard;
}

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
