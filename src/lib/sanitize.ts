/**
 * Sanitize user-provided text to prevent XSS.
 * Server-safe: no DOM dependency.
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  
  // Strip HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  sanitized = sanitized
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
  
  // Strip control characters
  sanitized = sanitized.replace(/[\x00-\x1F]/g, '');
  
  return sanitized.trim();
}

/**
 * Sanitize HTML (allow some tags for rich text fields).
 * For server-side: strips all tags since we can't safely whitelist without a DOM parser.
 */
export function sanitizeHtml(input: string | undefined | null): string {
  if (!input) return '';
  return sanitizeText(input);
}
