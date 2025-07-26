// Global path mapping cache
let pathMappingCache: Record<string, string> | null = null;

// Global home directory cache
let homeDirCache: string | null = null;

// Initialize path mapping cache
export function setPathMappingCache(mapping: Record<string, string>): void {
  pathMappingCache = mapping;
}

// Initialize home directory cache
export function setHomeDirCache(homeDir: string): void {
  homeDirCache = homeDir;
}

export async function normalizeProjectPath(
  encodedPath: string,
  pathMapping?: Record<string, string>,
): Promise<string> {
  if (!encodedPath) {
    return encodedPath;
  }

  // If already starts with /, it's likely already normalized
  if (encodedPath.startsWith("/")) {
    return encodedPath;
  }

  // Use provided mapping or cached mapping
  const mapping = pathMapping || pathMappingCache;

  // If we have a mapping and the encoded path exists in it, use the mapped value
  if (mapping && mapping[encodedPath]) {
    return mapping[encodedPath];
  }

  // Fallback to heuristic-based normalization for backward compatibility
  return normalizeProjectPathHeuristic(encodedPath);
}

// Legacy synchronous version for backward compatibility
export function normalizeProjectPathSync(
  encodedPath: string,
  _knownProjectPaths?: string[],
): string {
  if (!encodedPath) {
    return encodedPath;
  }

  // If already starts with /, it's likely already normalized
  if (encodedPath.startsWith("/")) {
    return encodedPath;
  }

  // Use cached mapping if available
  if (pathMappingCache && pathMappingCache[encodedPath]) {
    return pathMappingCache[encodedPath];
  }

  // Fallback to heuristic-based normalization
  return normalizeProjectPathHeuristic(encodedPath);
}

function normalizeProjectPathHeuristic(encodedPath: string): string {
  // Simple fallback: just replace dashes with slashes for basic conversion
  // This should rarely be used since we now rely on CWD-based mapping
  if (encodedPath.startsWith("-")) {
    return `/${encodedPath.substring(1).replace(/-/g, "/")}`;
  }

  return encodedPath.replace(/-/g, "/");
}

export function getProjectDisplayName(projectPath: string): string {
  const normalizedPath = normalizeProjectPathSync(projectPath);
  const segments = normalizedPath.split("/");
  return segments[segments.length - 1] || normalizedPath;
}

export function isPathInHomeDirectory(projectPath: string): boolean {
  const normalizedPath = normalizeProjectPathSync(projectPath);
  // Get home directory from cache, fallback to default if not initialized
  const homeDir = homeDirCache || "/Users/user";
  return normalizedPath.startsWith(homeDir);
}
