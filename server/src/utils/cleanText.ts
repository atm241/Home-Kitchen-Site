import sanitizeHtml from 'sanitize-html';

export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).trim();
}
