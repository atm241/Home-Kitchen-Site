// Store shelf prices from the official Kroger API, for estimating what the
// grocery list will cost before going shopping. Covers every Kroger banner
// (Kroger, Smith's, Ralphs, Fred Meyer, King Soopers, Fry's, QFC, ...).
//
// No AI is involved: each grocery item's name is sent to Kroger's product
// search at the household's chosen store, and the top relevant result's
// price is used. Results are cached per store + item for a few days, since
// shelf prices change weekly at most.
//
// Setup: create a free app at developer.kroger.com with the "Product" API,
// then set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in .env. Without them,
// every function here reports "not configured" and the app hides the feature.
import axios, { AxiosError } from 'axios';
import pool from '../config/database';

// Overridable only so the flow can be tested against a local fake server.
const API = process.env.KROGER_API_BASE || 'https://api.kroger.com/v1';
const CACHE_DAYS = 3;
const CONCURRENCY = 4;

const http = axios.create({
  baseURL: API,
  timeout: 10000,
  headers: { 'User-Agent': 'SimmerRecipeApp/1.0', Accept: 'application/json' },
});

export function krogerConfigured(): boolean {
  return !!(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET);
}

export class KrogerError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  if (!krogerConfigured()) throw new KrogerError('Store prices are not set up on this server.', 503);

  const basic = Buffer.from(`${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`).toString('base64');
  try {
    const res = await http.post(
      '/connect/oauth2/token',
      new URLSearchParams({ grant_type: 'client_credentials', scope: 'product.compact' }).toString(),
      { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const expiresIn = Number(res.data.expires_in) || 1800;
    // Refresh a minute early so a request never goes out with a token that
    // expires mid-flight.
    token = { value: res.data.access_token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
    return token.value;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 400 || status === 401) {
      throw new KrogerError('The Kroger API credentials on the server were rejected. Check KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.', 503);
    }
    throw new KrogerError("Couldn't reach Kroger right now. Try again in a bit.");
  }
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const bearer = await accessToken();
  try {
    const res = await http.get(path, { params, headers: { Authorization: `Bearer ${bearer}` } });
    return res.data as T;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 401) token = null; // Revoked or expired early; next call re-authenticates.
    if (status === 429) throw new KrogerError('Kroger is rate-limiting requests. Try again later.', 503);
    throw new KrogerError("Couldn't reach Kroger right now. Try again in a bit.");
  }
}

export interface KrogerStore {
  locationId: string;
  name: string;
  chain: string;
  address: string;
}

export async function findStores(zip: string): Promise<KrogerStore[]> {
  const data = await get<{ data: any[] }>('/locations', {
    'filter.zipCode.near': zip,
    'filter.limit': '10',
  });
  return (data.data || []).map((l) => ({
    locationId: String(l.locationId),
    name: String(l.name || l.chain || 'Kroger store'),
    chain: String(l.chain || ''),
    address: [l.address?.addressLine1, l.address?.city, l.address?.state].filter(Boolean).join(', '),
  }));
}

export interface PriceMatch {
  productId: string;
  description: string;
  size: string | null;
  price: number;
  /** Regular shelf price when price is a sale price; otherwise null. */
  regularPrice: number | null;
}

/** Kroger's search wants 3+ characters and at most 8 words. */
function searchTerm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(' ');
}

/** Crude plural strip used for substring matching: "berries" -> "berr" still matches "strawberry". */
function stem(word: string): string {
  return word.replace(/(ies|es|s)$/, '');
}

/**
 * Pick the first result (Kroger's own relevance order) that has a price and
 * whose description mentions every word of the search, so "salt" doesn't
 * match salted chips. Falls back to the first priced result.
 */
function bestProduct(term: string, products: any[]): PriceMatch | null {
  const words = term.split(' ').map(stem).filter((w) => w.length > 1);
  const priced = products
    .map((p) => {
      const item = (p.items || []).find((i: any) => Number(i?.price?.regular) > 0);
      if (!item) return null;
      const regular = Number(item.price.regular);
      const promo = Number(item.price.promo);
      const onSale = promo > 0 && promo < regular;
      return {
        productId: String(p.productId),
        description: String(p.description || term),
        size: item.size ? String(item.size) : null,
        price: onSale ? promo : regular,
        regularPrice: onSale ? regular : null,
      } as PriceMatch;
    })
    .filter((p): p is PriceMatch => p !== null);
  const relevant = priced.find((p) => {
    const desc = p.description.toLowerCase();
    return words.every((w) => desc.includes(w));
  });
  return relevant || priced[0] || null;
}

async function lookupPrice(locationId: string, name: string): Promise<PriceMatch | null> {
  const term = searchTerm(name);
  if (term.replace(/\s/g, '').length < 3) return null;

  const cached = await pool.query(
    `SELECT product_id, description, size, price, promo_price FROM kroger_price_cache
     WHERE location_id = $1 AND term = $2 AND fetched_at > CURRENT_TIMESTAMP - ($3 * INTERVAL '1 day')`,
    [locationId, term, CACHE_DAYS]
  );
  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    if (row.price === null) return null;
    const promo = row.promo_price === null ? null : Number(row.promo_price);
    return {
      productId: row.product_id,
      description: row.description,
      size: row.size,
      price: promo ?? Number(row.price),
      regularPrice: promo === null ? null : Number(row.price),
    };
  }

  const data = await get<{ data: any[] }>('/products', {
    'filter.term': term,
    'filter.locationId': locationId,
    'filter.limit': '10',
  });
  const match = bestProduct(term, data.data || []);

  // Cache misses too, so an item Kroger doesn't carry isn't re-searched on
  // every page load. price holds the regular price; promo_price the sale.
  await pool.query(
    `INSERT INTO kroger_price_cache (location_id, term, product_id, description, size, price, promo_price, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     ON CONFLICT (location_id, term) DO UPDATE SET
       product_id = EXCLUDED.product_id, description = EXCLUDED.description, size = EXCLUDED.size,
       price = EXCLUDED.price, promo_price = EXCLUDED.promo_price, fetched_at = EXCLUDED.fetched_at`,
    [
      locationId, term,
      match?.productId ?? null,
      match?.description?.slice(0, 300) ?? null,
      match?.size?.slice(0, 100) ?? null,
      match ? (match.regularPrice ?? match.price) : null,
      match && match.regularPrice !== null ? match.price : null,
    ]
  );
  return match;
}

export interface EstimateItem {
  id: number;
  name: string;
  match: PriceMatch | null;
}

/** Price each named item at the store, a few lookups at a time. */
export async function priceItems(
  locationId: string,
  items: Array<{ id: number; name: string }>
): Promise<EstimateItem[]> {
  const results: EstimateItem[] = new Array(items.length);
  let next = 0;
  let failures = 0;
  let firstError: unknown = null;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ...items[i], match: await lookupPrice(locationId, items[i].name) };
      } catch (error) {
        // One flaky lookup shows that item as unpriced instead of failing
        // the whole estimate. It isn't cached, so the next load retries it.
        failures++;
        firstError = firstError ?? error;
        results[i] = { ...items[i], match: null };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  if (items.length > 0 && failures === items.length) throw firstError;
  return results;
}
