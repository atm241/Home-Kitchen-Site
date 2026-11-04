import React, { useState } from 'react';
import { receiptsApi, GroceryReceipt, errorMessage } from '../../services/api';
import { formatDate } from '../../utils/dateUtils';
import Icon from '../Icon/Icon';
import styles from './LogReceiptDialog.module.css';

interface Props {
  onClose: () => void;
  onSaved: (receipt: GroceryReceipt) => void;
}

// Type in a receipt total. No photo needed, so it costs nothing to run.
// (Scanning a receipt from Pantry fills this in automatically.)
const LogReceiptDialog: React.FC<Props> = ({ onClose, onSaved }) => {
  const [total, setTotal] = useState('');
  const [store, setStore] = useState('');
  const [date, setDate] = useState(formatDate(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseFloat(total);
  const valid = Number.isFinite(amount) && amount >= 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await receiptsApi.add({ total: amount, store_name: store.trim() || null, purchased_on: date });
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not save that receipt'));
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.dialog} onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="logReceiptTitle">
        <div className={styles.header}>
          <h2 id="logReceiptTitle">Log a receipt</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className={styles.hint}>Just the total. It's subtracted from your grocery budget.</p>

        <label className={styles.field}>
          <span>Total paid</span>
          <span className={styles.money}>
            <span>$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="0.00"
              autoFocus
              required
            />
          </span>
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Store (optional)</span>
            <input className={styles.input} value={store} onChange={(e) => setStore(e.target.value)} placeholder="Smith's" maxLength={100} />
          </label>
          <label className={styles.field}>
            <span>Date</span>
            <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Save receipt'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LogReceiptDialog;
