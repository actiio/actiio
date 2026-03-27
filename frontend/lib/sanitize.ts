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
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "http://localhost");
    return parsed.origin === "http://localhost" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}
