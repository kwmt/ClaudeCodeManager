export function normalizeProjectPath(encodedPath: string): string {
  if (!encodedPath) {
    return encodedPath;
  }

  // If already starts with /, it's likely already normalized
  if (encodedPath.startsWith("/")) {
    return encodedPath;
  }

  const decoded = encodedPath.replace(/-/g, "/");

  if (decoded.startsWith("Users/")) {
    return `/${decoded}`;
  }

  return decoded;
}

export function getProjectDisplayName(projectPath: string): string {
  const normalizedPath = normalizeProjectPath(projectPath);
  const segments = normalizedPath.split("/");
  return segments[segments.length - 1] || normalizedPath;
}

export function isPathInHomeDirectory(projectPath: string): boolean {
  const normalizedPath = normalizeProjectPath(projectPath);
  return normalizedPath.startsWith("/Users/");
}
