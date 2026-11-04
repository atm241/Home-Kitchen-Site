import React, { useEffect, useState } from 'react';
import { shareApi, API_BASE_URL, errorMessage } from '../../services/api';
import { BRAND_NAME } from '../../components/Brand/brand';
import Icon from '../../components/Icon/Icon';
import styles from './ShareSetup.module.css';

// The Shortcut talks to the API directly, so it needs a full URL even when the
// app itself uses a relative "/api" path.
const importEndpoint = () => {
  const base = /^https?:\/\//i.test(API_BASE_URL) ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
  return `${base.replace(/\/$/, '')}/share/import`;
};

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const CopyField: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.copyField}>
      <span className={styles.copyLabel}>{label}</span>
      <div className={styles.copyRow}>
        <code>{value}</code>
        <button
          className="btn btn-secondary"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

const ShareSetup: React.FC = () => {
  const [platform, setPlatform] = useState<'ios' | 'android'>(isIOS() ? 'ios' : 'android');
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    shareApi.status().then(r => setHasKey(r.data.hasKey)).catch(() => {});
  }, []);

  const createKey = async () => {
    if (hasKey && !window.confirm('Make a new key? Your current Shortcut will stop working until you paste the new key into it.')) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await shareApi.createKey();
      setKey(data.key);
      setHasKey(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create a key. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async () => {
    if (!window.confirm('Turn off phone saving? Your Shortcut will stop working.')) return;
    await shareApi.revokeKey();
    setKey(null);
    setHasKey(false);
  };

  return (
    <div className={styles.page}>
      <h1>Save from your phone</h1>
      <p className={styles.lead}>
        Watching a recipe on TikTok, YouTube or Instagram? Tap Share and send it to {BRAND_NAME}. It lands
        in your cookbook as a clean recipe.
      </p>

      <div className={styles.segmented} role="tablist">
        <button role="tab" aria-selected={platform === 'ios'} className={platform === 'ios' ? styles.segOn : ''} onClick={() => setPlatform('ios')}>
          iPhone
        </button>
        <button role="tab" aria-selected={platform === 'android'} className={platform === 'android' ? styles.segOn : ''} onClick={() => setPlatform('android')}>
          Android
        </button>
      </div>

      {platform === 'ios' ? (
        <>
          <p className={styles.note}>
            iPhones don't let web apps appear in the share menu, so this uses a free Shortcut instead.
            It takes about two minutes to set up, once.
          </p>

          <ol className={styles.steps}>
            <li>
              <h3>Get your personal key</h3>
              <p>The Shortcut uses this instead of your password. It can only save recipes.</p>
              {key ? (
                <>
                  <CopyField label="Address" value={importEndpoint()} />
                  <CopyField label="Key (shown only once, so keep this page open until you're done)" value={`Bearer ${key}`} />
                </>
              ) : (
                <div className={styles.keyActions}>
                  <button className="btn btn-primary" onClick={createKey} disabled={busy}>
                    <Icon name="key" size={16} /> {hasKey ? 'Make a new key' : 'Create my key'}
                  </button>
                  {hasKey && <span className={styles.muted}>You already have a key set up.</span>}
                </div>
              )}
              {error && <p className={styles.error}>{error}</p>}
            </li>
            <li>
              <h3>Create the Shortcut</h3>
              <p>Open the <strong>Shortcuts</strong> app, tap <strong>+</strong>, and name it <strong>Save to {BRAND_NAME}</strong>.</p>
              <p>Tap the <strong>ⓘ</strong> button, turn on <strong>Show in Share Sheet</strong>, and set it to receive <strong>URLs</strong> and <strong>Text</strong>.</p>
            </li>
            <li>
              <h3>Add "Get Contents of URL"</h3>
              <p>Search for the <strong>Get Contents of URL</strong> action and add it. Paste the <strong>Address</strong> from step 1 as the URL, then tap <strong>Show More</strong>:</p>
              <ul className={styles.config}>
                <li><span>Method</span><strong>POST</strong></li>
                <li><span>Headers</span>Add one named <strong>Authorization</strong> and paste the <strong>Key</strong> from step 1 as its value</li>
                <li><span>Request Body</span><strong>JSON</strong>, add a Text field named <code>url</code> set to <strong>Shortcut Input</strong></li>
              </ul>
            </li>
            <li>
              <h3>Show the result</h3>
              <p>Add <strong>Get Dictionary Value</strong> (get Value for <code>message</code> in Contents of URL), then <strong>Show Notification</strong> with the Dictionary Value.</p>
            </li>
            <li>
              <h3>Try it</h3>
              <p>In TikTok, tap <strong>Share</strong> → <strong>More</strong> (or <strong>Share to</strong>) → <strong>Save to {BRAND_NAME}</strong>. In YouTube and Instagram, tap Share and pick it from the list. You'll get a notification like "Saved: Crispy Chili Oil Noodles".</p>
            </li>
          </ol>

          <p className={styles.note}>
            Your phone needs to reach this server when you share. If {BRAND_NAME} runs on a computer at home, that
            means being on your home Wi-Fi, or setting up remote access as described in the self-hosting guide.
          </p>
        </>
      ) : (
        <ol className={styles.steps}>
          <li>
            <h3>Install {BRAND_NAME}</h3>
            <p>Open this site in <strong>Chrome</strong>, tap the <strong>⋮</strong> menu, then <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</p>
          </li>
          <li>
            <h3>Share a video</h3>
            <p>In TikTok, YouTube or Instagram, tap <strong>Share</strong> and pick <strong>{BRAND_NAME}</strong>. If you don't see it, tap <strong>More</strong> first. The recipe opens in the app once it's saved.</p>
          </li>
        </ol>
      )}

      {hasKey && (
        <button className={styles.revoke} onClick={revokeKey}>
          Turn off iPhone Shortcut saving
        </button>
      )}
    </div>
  );
};

export default ShareSetup;
