import React, { useEffect, useState } from 'react';
import { onUpdateReady, applyUpdate } from '../../utils/swUpdate';
import styles from './UpdatePrompt.module.css';

// Banner shown when a newer build has been downloaded and is waiting to take
// over. Dismissible, because forcing a reload mid-task would be worse than
// running yesterday's build for another hour — the update still applies on the
// next natural restart.
const UpdatePrompt: React.FC = () => {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => onUpdateReady(setRegistration), []);

  if (!registration || dismissed) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.text}>A new version is available.</span>
      <div className={styles.actions}>
        <button className={styles.refresh} onClick={() => applyUpdate(registration)}>
          Refresh
        </button>
        <button
          className={styles.dismiss}
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update notice"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
