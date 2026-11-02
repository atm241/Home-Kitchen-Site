import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { recipesApi } from '../../services/api';
import { Recipe } from '../../types';
import Icon from '../../components/Icon/Icon';
import styles from './CookMode.module.css';

// Finds the first duration in a step ("simmer for 10 minutes", "bake 1 hr")
// so it can offer a one-tap timer.
export function findDurationSeconds(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i);
  if (!m) return null;
  // For a range like "8-10 minutes", start with the low end; it's easier to add time than undo overcooking.
  const amount = parseFloat(m[1]);
  const unit = m[3].toLowerCase();
  const factor = unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1;
  const seconds = Math.round(amount * factor);
  return seconds > 0 ? seconds : null;
}

const formatClock = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

const formatDuration = (total: number) =>
  total >= 3600
    ? `${Math.round((total / 3600) * 10) / 10} hr`
    : total >= 60 ? `${Math.round(total / 60)} min` : `${total} sec`;

// Keep the screen on while cooking, re-acquiring the lock when the tab comes
// back (browsers drop it whenever the page is hidden).
function useWakeLock() {
  useEffect(() => {
    const nav = navigator as any;
    if (!nav.wakeLock) return;
    let lock: any = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await nav.wakeLock.request('screen');
      } catch {
        // Battery saver or an unsupported browser; cooking still works.
      }
    };
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);
}

interface Timer {
  label: string;
  endsAt: number;
  total: number;
}

const CookMode: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState(false);
  // Step 0 is "gather your ingredients"; recipe steps start at 1.
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  const touchStart = useRef<number | null>(null);

  useWakeLock();

  useEffect(() => {
    recipesApi.getOne(Number(id)).then(r => setRecipe(r.data)).catch(() => setError(true));
  }, [id]);

  const steps = (recipe?.instructions || '').split('\n').map(s => s.trim()).filter(Boolean);
  const ingredients = recipe?.ingredients || [];
  const lastIndex = steps.length;

  const go = useCallback((delta: number) => {
    setIndex(i => Math.min(Math.max(i + delta, 0), lastIndex));
  }, [lastIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') navigate(`/recipes/${id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, id, navigate]);

  // Tick once a second only while a timer is running.
  useEffect(() => {
    if (timers.length === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [timers.length]);

  // Buzz once when a timer finishes.
  const announced = useRef<Set<number>>(new Set());
  useEffect(() => {
    timers.forEach(t => {
      if (t.endsAt <= now && !announced.current.has(t.endsAt)) {
        announced.current.add(t.endsAt);
        navigator.vibrate?.([300, 150, 300, 150, 300]);
      }
    });
  }, [now, timers]);

  const startTimer = (seconds: number, label: string) => {
    setNow(Date.now());
    setTimers(prev => [...prev, { label, total: seconds, endsAt: Date.now() + seconds * 1000 }]);
  };

  const toggleIngredient = (i: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (error) {
    return (
      <div className={styles.center}>
        <p>Couldn't load this recipe.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>Go back</button>
      </div>
    );
  }
  if (!recipe) return <div className={styles.center}>Loading…</div>;

  const step = index > 0 ? steps[index - 1] : null;
  const duration = step ? findDurationSeconds(step) : null;
  const progress = lastIndex > 0 ? index / lastIndex : 0;

  return (
    <div
      className={styles.page}
      onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
    >
      <header className={styles.header}>
        <button className={styles.close} onClick={() => navigate(`/recipes/${id}`)} aria-label="Exit cook mode">
          <Icon name="x" size={22} />
        </button>
        <div className={styles.headerTitle}>
          <span className={styles.recipeName}>{recipe.name}</span>
          <span className={styles.stepCount}>
            {index === 0 ? 'Get ready' : `Step ${index} of ${steps.length}`}
          </span>
        </div>
        <span className={styles.headerSpacer} />
      </header>
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
      </div>

      <main className={styles.stage}>
        {index === 0 ? (
          <div className={styles.gather}>
            <h1 className={styles.gatherTitle}>Gather your ingredients</h1>
            <p className={styles.gatherHint}>Tap each one as you set it out.</p>
            <ul className={styles.gatherList}>
              {ingredients.map((ing, i) => (
                <li key={i}>
                  <button
                    className={`${styles.gatherItem} ${checked.has(i) ? styles.gatherChecked : ''}`}
                    onClick={() => toggleIngredient(i)}
                    aria-pressed={checked.has(i)}
                  >
                    <span className={styles.checkbox}>{checked.has(i) && <Icon name="check" size={14} strokeWidth={3} />}</span>
                    <span>
                      {ing.quantity ? <strong>{ing.quantity}{ing.unit ? ` ${ing.unit}` : ''} </strong> : null}
                      {ing.name}
                      {ing.notes && <span className={styles.muted}>, {ing.notes}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={styles.stepWrap} key={index}>
            <div className={styles.bigNumber}>{index}</div>
            <p className={styles.stepText}>{step}</p>
            {duration && (
              <button className={styles.timerButton} onClick={() => startTimer(duration, `Step ${index}`)}>
                <Icon name="clock" size={18} /> Start {formatDuration(duration)} timer
              </button>
            )}
          </div>
        )}
      </main>

      {timers.length > 0 && (
        <div className={styles.timers}>
          {timers.map((t, i) => {
            const left = Math.max(0, Math.round((t.endsAt - now) / 1000));
            return (
              <div key={t.endsAt} className={`${styles.timer} ${left === 0 ? styles.timerDone : ''}`}>
                <span className={styles.timerLabel}>{t.label}</span>
                <span className={styles.timerClock}>{left === 0 ? 'Done' : formatClock(left)}</span>
                <button
                  className={styles.timerClose}
                  onClick={() => setTimers(prev => prev.filter((_, j) => j !== i))}
                  aria-label="Dismiss timer"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <footer className={styles.footer}>
        <button className="btn btn-secondary" onClick={() => go(-1)} disabled={index === 0}>
          <Icon name="chevronLeft" size={18} /> Back
        </button>
        {index < lastIndex ? (
          <button className={`btn btn-primary ${styles.next}`} onClick={() => go(1)}>
            {index === 0 ? "Let's cook" : 'Next'} <Icon name="chevronRight" size={18} />
          </button>
        ) : (
          <button className={`btn btn-primary ${styles.next}`} onClick={() => navigate(`/recipes/${id}`)}>
            <Icon name="check" size={18} /> Finished
          </button>
        )}
      </footer>
    </div>
  );
};

export default CookMode;
