import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recipesApi, errorMessage } from '../../services/api';
import Icon from '../Icon/Icon';
import styles from './ImportBar.module.css';

// Shown while the server works, so a 10-20 second import doesn't feel stuck.
const STAGES = ['Opening the link…', 'Reading the caption…', 'Writing up the recipe…', 'Almost there…'];

interface ImportBarProps {
  initialValue?: string;
  /** Start importing immediately (used when the phone's share menu opens the app). */
  autoStart?: boolean;
  size?: 'large' | 'normal';
  autoFocus?: boolean;
}

const ImportBar: React.FC<ImportBarProps> = ({ initialValue = '', autoStart = false, size = 'normal', autoFocus }) => {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialValue);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  const runImport = async (link: string) => {
    const trimmed = link.trim();
    if (!trimmed || importing) return;
    setError(null);
    setImporting(true);
    setStage(0);
    const timer = window.setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 3500);
    try {
      const { data } = await recipesApi.importFromUrl(trimmed);
      navigate(`/recipes/${data.id}`, { state: { justImported: true, duplicate: !!data.duplicate } });
    } catch (err) {
      setError(errorMessage(err, "Couldn't import that link. Please try again."));
    } finally {
      window.clearInterval(timer);
      setImporting(false);
    }
  };

  useEffect(() => {
    if (autoStart && initialValue && !started.current) {
      started.current = true;
      runImport(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, initialValue]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text);
        runImport(text);
      }
    } catch {
      setError('Paste the link into the box instead. Your browser blocked clipboard access.');
    }
  };

  return (
    <div className={`${styles.wrap} ${size === 'large' ? styles.large : ''}`}>
      <form
        className={styles.bar}
        onSubmit={(e) => {
          e.preventDefault();
          runImport(value);
        }}
      >
        <Icon name="link" size={20} className={styles.leadIcon} />
        <input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a video or recipe link"
          className={styles.input}
          disabled={importing}
          autoFocus={autoFocus}
          aria-label="Recipe or video link"
        />
        {value.trim() ? (
          <button type="submit" className="btn btn-primary" disabled={importing}>
            {importing ? <span className={styles.spinner} aria-hidden="true" /> : null}
            {importing ? 'Saving' : 'Save'}
          </button>
        ) : canPaste ? (
          <button type="button" className="btn btn-primary" onClick={handlePaste} disabled={importing}>
            Paste
          </button>
        ) : null}
      </form>
      <div className={styles.status} aria-live="polite">
        {importing && <span className={styles.stage}>{STAGES[stage]}</span>}
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
};

export default ImportBar;
