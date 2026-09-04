import sanitizeHtml from 'sanitize-html';

// Common named entities that survive tag-stripping. Numeric forms are handled
// generically below.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔',
  deg: '°', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z0-9#]+);/gi, (match, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
        ? NAMED_ENTITIES[key]
        : match;
    });
}

// Strip HTML and return readable plain text.
//
// sanitize-html removes the tags but leaves entities encoded, so scraped text
// was landing in the database with literal "&nbsp;" and "&amp;" in it —
// visible to users and, worse, part of ingredient names, which made two
// otherwise identical ingredients fail to match.
//
// Decoding runs after sanitizing, never before: decoding first could turn
// "&lt;script&gt;" into a real tag that then passes through as text.
export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  const stripped = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
  // Non-breaking spaces collapse to ordinary ones so names compare equal.
  return decodeEntities(stripped).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}
