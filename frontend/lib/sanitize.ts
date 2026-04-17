export function sanitizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gis, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeMultilineText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gis, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function sanitizeEmail(value: string): string {
  return sanitizeText(value).toLowerCase();
}

export function hasUnsafeControlChars(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

export function safeRelativePath(value: string | null | undefined, fallback = "/agents"): string {
  if (!value) return fallback;
  const candidate = value.trim();

  // Basic security: must start with / and not be a protocol-relative // URL
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    // We use a base URL to help the URL parser, then extract what we need.
    const url = new URL(candidate, "http://localhost");
    
    // Ensure it's still pointing to the same "origin" (localhost), 
    // protecting against cases like "/\\google.com" which some browsers parse as absolute.
    if (url.origin !== "http://localhost") {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Merges top-level search parameters into a relative path's query string.
 * Useful for carrying over subscription params through a sign-in redirect.
 */
export function mergeQueryParams(relativePath: string, params: URLSearchParams): string {
  try {
    const url = new URL(relativePath, "http://localhost");
    params.forEach((value, key) => {
      // Don't overwrite existing sub-path params if already present,
      // but do carry over the new ones like subscription_id, etc.
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    });
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return relativePath;
  }
}
