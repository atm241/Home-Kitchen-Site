// Cached Spoonacular results (recipe recommendations and ingredient combos)
// go stale after this long; an expired cache is refetched automatically on
// the next request. A pantry change (new signature) still requires a manual
// refresh so quota isn't spent on every pantry edit.
export const CACHE_TTL_DAYS = 7;

export function cacheExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);
  return expiresAt;
}
