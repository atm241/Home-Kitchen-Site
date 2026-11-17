import React, { useEffect, useRef, useState } from 'react';
import { storesApi, StoreChoice, StoreSearchResult, PriceEstimate } from '../../services/api';
import styles from './StorePrices.module.css';

interface Props {
  weekStartDate: string;
  /** Changes whenever the list does, so the estimate follows it. */
  listKey: string;
  /** Budget left this period, if the household set one. */
  budgetRemaining: number | null;
  onEstimate: (estimate: PriceEstimate | null) => void;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * "About $54 at Smith's" for what's left on the list, from the store's real
 * shelf prices, plus the one-time store picker. Renders nothing when the
 * server has no Kroger API credentials.
 */
const StorePrices: React.FC<Props> = ({ weekStartDate, listKey, budgetRemaining, onEstimate }) => {
  const [configured, setConfigured] = useState(false);
  const [store, setStore] = useState<StoreChoice | null>(null);
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [picking, setPicking] = useState(false);
  const [zip, setZip] = useState('');
  const [results, setResults] = useState<StoreSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const onEstimateRef = useRef(onEstimate);
  onEstimateRef.current = onEstimate;

  useEffect(() => {
    storesApi.status()
      .then((r) => { setConfigured(r.data.configured); setStore(r.data.store); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!configured || !store) {
      setEstimate(null);
      onEstimateRef.current(null);
      return;
    }
    // Checking items off in quick succession shouldn't fire a request each.
    const timer = setTimeout(() => {
      setEstimating(true);
      setError(null);
      storesApi.estimate(weekStartDate)
        .then((r) => { setEstimate(r.data); onEstimateRef.current(r.data); })
        .catch((err) => setError(err.response?.data?.error || "Couldn't load store prices."))
        .finally(() => setEstimating(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [configured, store, weekStartDate, listKey]);

  if (!configured) return null;

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{5}$/.test(zip.trim())) { setError('Enter a 5-digit ZIP code.'); return; }
    setSearching(true);
    setError(null);
    try {
      const r = await storesApi.search(zip.trim());
      setResults(r.data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Couldn't search stores.");
    } finally {
      setSearching(false);
    }
  };

  const choose = async (s: StoreSearchResult) => {
    try {
      const r = await storesApi.choose({ locationId: s.locationId, name: s.name });
      setStore(r.data.store);
      setPicking(false);
      setResults(null);
    } catch (err: any) {
      setError(err.response?.data?.error || "Couldn't save that store.");
    }
  };

  if (picking || !store) {
    if (!picking) {
      return (
        <button type="button" className={styles.linkButton} onClick={() => setPicking(true)}>
          See store prices before you shop
        </button>
      );
    }
    return (
      <div className={styles.picker}>
        <form onSubmit={search} className={styles.zipRow}>
          <input
            inputMode="numeric"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
            placeholder="ZIP code"
            aria-label="ZIP code"
            className={styles.zipInput}
            autoFocus
          />
          <button type="submit" className="btn btn-secondary" disabled={searching}>
            {searching ? 'Finding…' : 'Find stores'}
          </button>
          <button type="button" className={styles.linkButton} onClick={() => { setPicking(false); setResults(null); setError(null); }}>
            Cancel
          </button>
        </form>
        <p className={styles.hint}>Kroger-family stores: Kroger, Smith's, Ralphs, Fred Meyer, King Soopers, Fry's, QFC…</p>
        {results && results.length === 0 && <p className={styles.hint}>No Kroger-family stores near that ZIP.</p>}
        {results && results.length > 0 && (
          <ul className={styles.results}>
            {results.map((s) => (
              <li key={s.locationId}>
                <button type="button" className={styles.result} onClick={() => choose(s)}>
                  <strong>{s.name}</strong>
                  <span>{s.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  const priced = estimate?.items.filter((i) => i.price !== null).length ?? 0;
  const unpriced = (estimate?.items.length ?? 0) - priced;
  const afterBudget = estimate && budgetRemaining !== null ? budgetRemaining - estimate.total : null;

  return (
    <div className={styles.line}>
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : estimate && estimate.items.length > 0 ? (
        <>
          <span className={`${styles.total} ${afterBudget !== null && afterBudget < 0 ? styles.over : ''}`}>
            About {money(estimate.total)} at {store.name}
          </span>
          {afterBudget !== null && (
            <span className={styles.detail}>
              {afterBudget >= 0 ? ` · leaves ${money(afterBudget)} in budget` : ` · ${money(-afterBudget)} over budget`}
            </span>
          )}
          {unpriced > 0 && <span className={styles.detail}> · {unpriced} item{unpriced === 1 ? '' : 's'} not found</span>}
        </>
      ) : estimating ? (
        <span className={styles.detail}>Checking prices at {store.name}…</span>
      ) : (
        <span className={styles.detail}>Prices from {store.name}</span>
      )}
      <button type="button" className={styles.linkButton} onClick={() => setPicking(true)}>Change store</button>
    </div>
  );
};

export default StorePrices;
