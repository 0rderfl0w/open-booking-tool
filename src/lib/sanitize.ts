import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize user-provided text to prevent XSS.
 * Strips HTML tags and control characters.
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  
  // Strip HTML tags
  let sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  
  // Strip control characters
  sanitized = sanitized.replace(/[\x00-\x1F]/g, '');
  
  return sanitized.trim();
}

/**
 * Sanitize HTML (allow some tags for rich text fields).
 */
export function sanitizeHtml(input: string | undefined | null): string {
  if (!input) return '';
  
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}
