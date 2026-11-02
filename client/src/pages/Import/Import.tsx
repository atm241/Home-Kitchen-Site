import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { recipesApi, BulkImportResult, errorMessage } from '../../services/api';
import ImportBar from '../../components/ImportBar/ImportBar';
import Icon from '../../components/Icon/Icon';
import styles from './Import.module.css';

// Pull a link out of whatever an app shared. Android's share menu sends
// ?url=, ?text= and/or ?title=; TikTok, for example, puts the link inside the
// text ("Check out this video! https://vm.tiktok.com/...").
function sharedLink(params: URLSearchParams): string {
  for (const key of ['url', 'text', 'title']) {
    const value = params.get(key);
    const match = value?.match(/https?:\/\/[^\s<>"']+/i);
    if (match) return match[0];
  }
  return '';
}

const Import: React.FC = () => {
  const [params] = useSearchParams();
  const shared = sharedLink(params);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const runBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = bulkText.split(/\s+/).map(u => u.trim()).filter(u => /^https?:\/\//i.test(u));
    if (urls.length === 0) return;
    setBulkRunning(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const { data } = await recipesApi.importBulk(urls);
      setBulkResult(data);
      setBulkText('');
    } catch (err) {
      setBulkError(errorMessage(err, 'Import failed. Please try again.'));
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1>Add a recipe</h1>
      <p className={styles.lead}>
        Paste a link to a TikTok, YouTube video, Instagram Reel or any recipe website. We'll pull the
        ingredients and steps out of the caption.
      </p>

      <ImportBar size="large" initialValue={shared} autoStart={!!shared} autoFocus={!shared} />

      <div className={styles.options}>
        <Link to="/recipes/new" className={styles.option}>
          <span className={styles.optionIcon}><Icon name="camera" size={20} /></span>
          <span>
            <strong>From a photo</strong>
            <span>Cookbook page, recipe card or screenshot</span>
          </span>
        </Link>
        <Link to="/recipes/new" className={styles.option}>
          <span className={styles.optionIcon}><Icon name="edit" size={20} /></span>
          <span>
            <strong>Type it in</strong>
            <span>Family recipes and your own creations</span>
          </span>
        </Link>
        <Link to="/settings/share" className={styles.option}>
          <span className={styles.optionIcon}><Icon name="share" size={20} /></span>
          <span>
            <strong>Save from your phone</strong>
            <span>Send videos here from TikTok or Instagram's share button</span>
          </span>
        </Link>
      </div>

      <div className={styles.bulk}>
        <button className={styles.bulkToggle} onClick={() => setShowBulk(v => !v)} aria-expanded={showBulk}>
          <Icon name="chevronRight" size={16} className={showBulk ? styles.rotated : undefined} />
          Import several links at once
        </button>
        {showBulk && (
          <form onSubmit={runBulk} className={styles.bulkForm}>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="One link per line"
              rows={5}
              disabled={bulkRunning}
            />
            <button type="submit" className="btn btn-secondary" disabled={bulkRunning || !bulkText.trim()}>
              {bulkRunning ? 'Importing… this can take a minute' : 'Import all'}
            </button>
            {bulkError && <p className={styles.error}>{bulkError}</p>}
            {bulkResult && (
              <div className={styles.bulkResult}>
                <p>
                  <strong>{bulkResult.imported}</strong> saved
                  {bulkResult.skipped > 0 && <>, <strong>{bulkResult.skipped}</strong> already in your cookbook</>}
                  {bulkResult.failed > 0 && <>, <strong>{bulkResult.failed}</strong> couldn't be read</>}
                </p>
                {bulkResult.results.filter(r => r.status === 'failed').map(r => (
                  <p key={r.url} className={styles.failedRow}>{r.url}: {r.error}</p>
                ))}
                <Link to="/">Go to your cookbook</Link>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default Import;
