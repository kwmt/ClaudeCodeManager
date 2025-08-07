/**
 * Utility functions for managing improved settings UI
 *
 * These functions provide easy access to enable/disable the improved
 * settings interface through localStorage and URL parameters.
 */

const IMPROVED_SETTINGS_KEY = "claude-improved-settings";
const URL_PARAM_KEY = "improved-settings";

/**
 * Enable the improved settings UI
 * This will persist the setting in localStorage
 */
export const enableImprovedSettings = (): void => {
  localStorage.setItem(IMPROVED_SETTINGS_KEY, "true");
  console.log(
    "🎨 Improved Settings UI enabled! Refresh the page to see changes.",
  );
};

/**
 * Disable the improved settings UI
 * This will remove the setting from localStorage
 */
export const disableImprovedSettings = (): void => {
  localStorage.removeItem(IMPROVED_SETTINGS_KEY);
  console.log(
    "📝 Improved Settings UI disabled! Refresh the page to see changes.",
  );
};

/**
 * Check if improved settings UI is currently enabled
 */
export const isImprovedSettingsEnabled = (): boolean => {
  // Check URL parameter first (takes precedence)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get(URL_PARAM_KEY) === "true") {
    return true;
  }

  // Check localStorage flag
  const storageFlag = localStorage.getItem(IMPROVED_SETTINGS_KEY);
  return storageFlag === "true";
};

/**
 * Toggle the improved settings UI on/off
 */
export const toggleImprovedSettings = (): boolean => {
  const isCurrentlyEnabled = isImprovedSettingsEnabled();

  if (isCurrentlyEnabled) {
    disableImprovedSettings();
    return false;
  } else {
    enableImprovedSettings();
    return true;
  }
};

/**
 * Get the URL to access the improved settings UI directly
 */
export const getImprovedSettingsUrl = (): string => {
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set(URL_PARAM_KEY, "true");
  // Ensure we're on the settings tab
  currentUrl.hash = "#settings";
  return currentUrl.toString();
};

/**
 * Helper to make these functions available in the browser console for debugging
 */
if (typeof window !== "undefined") {
  // Make functions available globally for easy debugging
  (window as any).claudeSettings = {
    enable: enableImprovedSettings,
    disable: disableImprovedSettings,
    toggle: toggleImprovedSettings,
    isEnabled: isImprovedSettingsEnabled,
    getUrl: getImprovedSettingsUrl,
  };

  // Log helpful information to console in development
  if (process.env.NODE_ENV === "development") {
    console.log(`
🎨 Claude Code Manager - Improved Settings UI

To enable the new settings interface:
• claudeSettings.enable() - Enable permanently
• claudeSettings.disable() - Disable permanently  
• claudeSettings.toggle() - Toggle on/off
• claudeSettings.isEnabled() - Check current status
• claudeSettings.getUrl() - Get direct URL

Or visit: ${window.location.origin}${window.location.pathname}?improved-settings=true#settings
    `);
  }
}
