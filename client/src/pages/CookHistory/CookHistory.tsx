import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cookHistoryApi } from '../../services/api';
import { CookHistoryEntry } from '../../types';
import { resolveImageUrl } from '../../utils/imageUtils';
import styles from './CookHistory.module.css';

const CookHistory: React.FC = () => {
  const [history, setHistory] = useState<CookHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await cookHistoryApi.getAll(100);
      setHistory(response.data);
    } catch (error) {
      console.error('Error loading cook history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await cookHistoryApi.delete(id);
      setHistory(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to delete entry' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Group by date
  const grouped = history.reduce((acc, entry) => {
    const date = new Date(entry.cooked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, CookHistoryEntry[]>);

  if (loading) return <div className={styles.loading}>Loading cook history...</div>;

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      <div className={styles.header}>
        <h1>Cook History</h1>
        <p className={styles.subtitle}>A log of every meal you've cooked</p>
      </div>

      {history.length === 0 ? (
        <div className={styles.empty}>
          <p>No cook history yet.</p>
          <p>Use "Mark as Cooked" on a <Link to="/recipes" className={styles.link}>recipe page</Link> to start tracking.</p>
        </div>
      ) : (
        <div className={styles.historyList}>
          {Object.entries(grouped).map(([date, entries]) => (
            <div key={date} className={styles.dateGroup}>
              <div className={styles.dateDivider}>{date}</div>
              {entries.map(entry => (
                <div key={entry.id} className={styles.historyEntry}>
                  {entry.image_url && (
                    <img src={resolveImageUrl(entry.image_url)} alt={entry.recipe_name} className={styles.entryImage} />
                  )}
                  <div className={styles.entryBody}>
                    <div className={styles.entryName}>
                      {entry.recipe_id ? (
                        <Link to={`/recipes/${entry.recipe_id}`} className={styles.recipeLink}>
                          {entry.recipe_name}
                        </Link>
                      ) : (
                        entry.recipe_name
                      )}
                    </div>
                    <div className={styles.entryMeta}>
                      {entry.servings_cooked && <span>{entry.servings_cooked} serving{entry.servings_cooked !== 1 ? 's' : ''}</span>}
                      {entry.category && <span className={styles.entryCategory}>{entry.category}</span>}
                      {entry.calories && <span>{entry.calories} cal/serving</span>}
                      <span className={styles.entryTime}>{formatTime(entry.cooked_at)}</span>
                    </div>
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(entry.id)}
                    title="Remove from history"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CookHistory;
