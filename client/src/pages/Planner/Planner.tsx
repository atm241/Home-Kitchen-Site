import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, parseISO } from 'date-fns';
import {
  plannerApi, recipesApi, errorMessage,
  PlannerGoals, PlanMeal, PlanRecipeCard, PlanSummary, MealSlot, PlannerStatus,
} from '../../services/api';
import { Recipe } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { resolveImageUrl } from '../../utils/imageUtils';
import Icon from '../../components/Icon/Icon';
import styles from './Planner.module.css';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const PERIODS: Array<{ days: 7 | 14 | 30; label: string }> = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];

type ExtraGoal = 'protein_goal' | 'fiber_goal' | 'carbs_limit' | 'fat_limit';
const EXTRA_GOALS: Array<{ key: ExtraGoal; chip: string; label: string; fallback: number }> = [
  { key: 'protein_goal', chip: 'Protein', label: 'Protein, at least', fallback: 120 },
  { key: 'fiber_goal', chip: 'Fiber', label: 'Fiber, at least', fallback: 30 },
  { key: 'carbs_limit', chip: 'Carbs', label: 'Carbs, at most', fallback: 200 },
  { key: 'fat_limit', chip: 'Fat', label: 'Fat, at most', fallback: 70 },
];

const toCard = (r: Recipe): PlanRecipeCard => ({
  id: r.id,
  name: r.name,
  category: r.category ?? null,
  image_url: r.image_url ?? null,
  calories: r.calories ?? null,
  protein: r.protein ?? null,
  fiber: r.fiber ?? null,
  total_time: (r.prep_time || 0) + (r.cook_time || 0) || null,
  is_favorite: !!r.is_favorite,
  pantry_share: 0,
});

const key = (m: { date: string; slot: MealSlot }) => `${m.date}|${m.slot}`;

const Planner: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<PlannerStatus | null>(null);
  const [goals, setGoals] = useState<PlannerGoals | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'goals' | 'review'>('goals');

  const [meals, setMeals] = useState<PlanMeal[]>([]);
  const [recipes, setRecipes] = useState<Record<number, PlanRecipeCard>>({});
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addToGrocery, setAddToGrocery] = useState(true);

  const [picker, setPicker] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [pickerIds, setPickerIds] = useState<number[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [allRecipes, setAllRecipes] = useState<Recipe[] | null>(null);

  useEffect(() => {
    plannerApi.status()
      .then((res) => {
        const p = res.data.preferences;
        setStatus(res.data);
        setGoals(p);
        setForm({
          budget: p.budget_amount ? String(p.budget_amount) : '',
          calories: String(p.daily_calories ?? 2000),
          protein_goal: p.protein_goal ? String(p.protein_goal) : '',
          fiber_goal: p.fiber_goal ? String(p.fiber_goal) : '',
          carbs_limit: p.carbs_limit ? String(p.carbs_limit) : '',
          fat_limit: p.fat_limit ? String(p.fat_limit) : '',
        });
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load the planner")));
  }, []);

  const [enabled, setEnabled] = useState<Set<ExtraGoal>>(new Set());
  useEffect(() => {
    if (!goals) return;
    setEnabled(new Set(EXTRA_GOALS.filter((g) => goals[g.key]).map((g) => g.key)));
    // Only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const currentGoals = (): PlannerGoals | null => {
    if (!goals) return null;
    const n = (v?: string) => (v && Number(v) > 0 ? Math.round(Number(v)) : null);
    return {
      ...goals,
      budget_amount: form.budget && Number(form.budget) > 0 ? Math.round(Number(form.budget) * 100) / 100 : null,
      daily_calories: n(form.calories),
      protein_goal: enabled.has('protein_goal') ? n(form.protein_goal) : null,
      fiber_goal: enabled.has('fiber_goal') ? n(form.fiber_goal) : null,
      carbs_limit: enabled.has('carbs_limit') ? n(form.carbs_limit) : null,
      fat_limit: enabled.has('fat_limit') ? n(form.fat_limit) : null,
    };
  };

  const build = async (pinned: PlanMeal[] = []) => {
    const g = currentGoals();
    if (!g) return;
    setGoals(g);
    setBusy('generate');
    setError(null);
    try {
      const res = await plannerApi.generate({ goals: g, pinned, seed: Math.floor(Math.random() * 1e9) });
      setMeals(res.data.meals);
      setRecipes(res.data.recipes);
      setSummary(res.data.summary);
      setWarnings(res.data.warnings ?? []);
      setStep('review');
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errorMessage(err, "Couldn't build a plan"));
    } finally {
      setBusy(null);
    }
  };

  const updateMeals = async (next: PlanMeal[], extra: Record<number, PlanRecipeCard> = {}) => {
    setMeals(next);
    setRecipes((r) => ({ ...r, ...extra }));
    if (!goals) return;
    try {
      const res = await plannerApi.evaluate({ goals, meals: next });
      setSummary(res.data.summary);
      setRecipes((r) => ({ ...r, ...res.data.recipes }));
    } catch {
      // Totals stay a step behind; the plan itself is still right.
    }
  };

  const removeMeal = (target: { date: string; slot: MealSlot }) =>
    updateMeals(meals.filter((m) => key(m) !== key(target)));

  const chooseRecipe = (card: PlanRecipeCard) => {
    if (!picker || !goals) return;
    const next = meals.filter((m) => key(m) !== key(picker));
    next.push({ date: picker.date, slot: picker.slot, recipe_id: card.id, servings: goals.servings, pinned: true });
    next.sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
    setPicker(null);
    updateMeals(next, { [card.id]: card });
  };

  const openPicker = async (target: { date: string; slot: MealSlot }) => {
    if (!goals) return;
    setPicker(target);
    setPickerQuery('');
    setPickerIds([]);
    setPickerLoading(true);
    if (!allRecipes) recipesApi.getAll().then((r) => setAllRecipes(r.data)).catch(() => setAllRecipes([]));
    try {
      const res = await plannerApi.alternatives({ goals, meals, ...target });
      setRecipes((r) => ({ ...r, ...res.data.recipes }));
      setPickerIds(res.data.recipe_ids);
    } catch {
      setPickerIds([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const save = async () => {
    if (!goals) return;
    setBusy('save');
    setError(null);
    try {
      const res = await plannerApi.commit({ goals, meals, add_to_grocery: addToGrocery });
      navigate('/plan', { state: { planSaved: res.data } });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the plan"));
      setBusy(null);
    }
  };

  const dates = useMemo(() => {
    if (!goals) return [];
    return Array.from({ length: goals.period_days }, (_, i) => formatDate(addDays(parseISO(goals.start_date), i)));
  }, [goals]);

  const mealAt = useMemo(() => {
    const map = new Map<string, PlanMeal>();
    meals.forEach((m) => map.set(key(m), m));
    return map;
  }, [meals]);

  const dayTotals = useMemo(() => {
    const map = new Map<string, PlanSummary['days'][number]>();
    summary?.days.forEach((d) => map.set(d.date, d));
    return map;
  }, [summary]);

  if (error && !goals) {
    return <div className={styles.errorBox}>{error}</div>;
  }
  if (!goals || !status) {
    return <div className={styles.loading}>Loading…</div>;
  }

  const periodLabel = PERIODS.find((p) => p.days === goals.period_days)?.label ?? `${goals.period_days} days`;
  const fewRecipes = status.recipe_count < 6;

  // ---------- Step 1: goals ----------
  if (step === 'goals') {
    const toggleSlot = (slot: MealSlot) => {
      const has = goals.meal_slots.includes(slot);
      const next = has ? goals.meal_slots.filter((s) => s !== slot) : SLOTS.filter((s) => s === slot || goals.meal_slots.includes(s));
      if (next.length) setGoals({ ...goals, meal_slots: next });
    };
    const toggleExtra = (g: (typeof EXTRA_GOALS)[number]) => {
      const next = new Set(enabled);
      if (next.has(g.key)) next.delete(g.key);
      else {
        next.add(g.key);
        if (!form[g.key]) setForm((f) => ({ ...f, [g.key]: String(g.fallback) }));
      }
      setEnabled(next);
    };

    return (
      <div className={styles.goalsPage}>
        <Link to="/plan" className={styles.back}><Icon name="chevronLeft" size={16} /> Plan</Link>
        <header className={styles.goalsHeader}>
          <span className={styles.badge}><Icon name="sparkle" size={14} /> Auto-plan</span>
          <h1>Plan my meals</h1>
          <p className={styles.subtitle}>
            Tell Simmer your goals and it fills your calendar from your cookbook. You can swap anything before saving.
          </p>
        </header>

        {fewRecipes && (
          <div className={styles.notice}>
            <Icon name="book" size={18} />
            <span>
              You have {status.recipe_count} recipe{status.recipe_count === 1 ? '' : 's'} saved. Plans get better with more variety,
              so <Link to="/">save a few more</Link>, especially breakfasts.
            </span>
          </div>
        )}

        <form className={styles.goalsCard} onSubmit={(e) => { e.preventDefault(); build(); }}>
          <section className={styles.field}>
            <span className={styles.label}>How long?</span>
            <div className={styles.segmented}>
              {PERIODS.map((p) => (
                <button
                  type="button"
                  key={p.days}
                  className={`${styles.segment} ${goals.period_days === p.days ? styles.segmentActive : ''}`}
                  onClick={() => setGoals({ ...goals, period_days: p.days })}
                  aria-pressed={goals.period_days === p.days}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>Starting</span>
              <input
                type="date"
                className={styles.input}
                value={goals.start_date}
                onChange={(e) => e.target.value && setGoals({ ...goals, start_date: e.target.value })}
              />
            </label>
            <div className={styles.field}>
              <span className={styles.label}>People</span>
              <div className={styles.stepper}>
                <button type="button" onClick={() => setGoals({ ...goals, servings: Math.max(1, goals.servings - 1) })} aria-label="Fewer people">−</button>
                <span>{goals.servings}</span>
                <button type="button" onClick={() => setGoals({ ...goals, servings: Math.min(12, goals.servings + 1) })} aria-label="More people">+</button>
              </div>
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Grocery budget <em>optional</em></span>
            <span className={styles.money}>
              <span>$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                placeholder="e.g. 150"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
              <span className={styles.moneySuffix}>for {periodLabel}</span>
            </span>
            <span className={styles.help}>
              Spending comes from your receipt totals. With a budget, Simmer favors recipes that share ingredients so the list stays short.
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Calories per person, per day</span>
            <span className={styles.unitInput}>
              <input
                type="number"
                inputMode="numeric"
                min="800"
                max="6000"
                step="50"
                value={form.calories}
                onChange={(e) => setForm({ ...form, calories: e.target.value })}
                placeholder="2000"
              />
              <span>cal</span>
            </span>
          </label>

          <section className={styles.field}>
            <span className={styles.label}>Other goals <em>optional</em></span>
            <div className={styles.chips}>
              {EXTRA_GOALS.map((g) => (
                <button
                  type="button"
                  key={g.key}
                  className={`chip ${enabled.has(g.key) ? 'chip-active' : ''}`}
                  onClick={() => toggleExtra(g)}
                  aria-pressed={enabled.has(g.key)}
                >
                  {enabled.has(g.key) ? <Icon name="check" size={13} strokeWidth={3} /> : <Icon name="plus" size={13} strokeWidth={2.5} />}
                  {g.chip}
                </button>
              ))}
            </div>
            {EXTRA_GOALS.filter((g) => enabled.has(g.key)).map((g) => (
              <label key={g.key} className={styles.extraRow}>
                <span>{g.label}</span>
                <span className={styles.unitInput}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={form[g.key]}
                    onChange={(e) => setForm({ ...form, [g.key]: e.target.value })}
                  />
                  <span>g/day</span>
                </span>
              </label>
            ))}
          </section>

          <section className={styles.field}>
            <span className={styles.label}>Meals to plan</span>
            <div className={styles.chips}>
              {SLOTS.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  className={`chip ${goals.meal_slots.includes(slot) ? 'chip-active' : ''} ${styles.slotChip}`}
                  onClick={() => toggleSlot(slot)}
                  aria-pressed={goals.meal_slots.includes(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
          </section>

          {error && <p className={styles.errorText}>{error}</p>}

          <button type="submit" className={`btn btn-primary ${styles.buildButton}`} disabled={busy !== null || status.recipe_count === 0}>
            <Icon name="sparkle" size={18} />
            {busy === 'generate' ? 'Planning…' : `Build my ${periodLabel} plan`}
          </button>
        </form>
      </div>
    );
  }

  // ---------- Step 2: review ----------
  const calorieTarget = summary?.calorie_target ?? null;
  const weeks: string[][] = [];
  dates.forEach((d, i) => {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  });

  const pickerList: PlanRecipeCard[] = (() => {
    if (!picker) return [];
    const q = pickerQuery.trim().toLowerCase();
    if (q) {
      return (allRecipes ?? [])
        .filter((r) => r.name.toLowerCase().includes(q))
        .slice(0, 40)
        .map((r) => recipes[r.id] ?? toCard(r));
    }
    return pickerIds.map((id) => recipes[id]).filter(Boolean);
  })();

  return (
    <div className={styles.reviewPage}>
      <button className={styles.back} onClick={() => setStep('goals')}>
        <Icon name="chevronLeft" size={16} /> Goals
      </button>

      <header className={styles.reviewHeader}>
        <div>
          <h1>Your plan</h1>
          <p className={styles.subtitle}>
            {formatDate(dates[0], 'MMM d')} – {formatDate(dates[dates.length - 1], 'MMM d')} · {goals.servings} {goals.servings === 1 ? 'person' : 'people'} ·{' '}
            tap any meal to swap it
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => build(meals.filter((m) => m.pinned && !m.existing_id))} disabled={busy !== null}>
          <Icon name="refresh" size={16} /> {busy === 'generate' ? 'Planning…' : 'Shuffle'}
        </button>
      </header>

      {summary && (
        <div className={styles.stats}>
          {calorieTarget ? (
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.avg_calories.toLocaleString()}</span>
              <span className={styles.statLabel}>cal/day avg · goal {calorieTarget.toLocaleString()}</span>
            </div>
          ) : (
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.avg_calories.toLocaleString()}</span>
              <span className={styles.statLabel}>cal/day avg</span>
            </div>
          )}
          {calorieTarget && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.days_on_target}/{summary.planned_days}</span>
              <span className={styles.statLabel}>days within 10%</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statValue}>{summary.avg_protein}g</span>
            <span className={styles.statLabel}>protein/day{goals.protein_goal ? ` · goal ${goals.protein_goal}g` : ''}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{summary.items_to_buy}</span>
            <span className={styles.statLabel}>items to buy · {summary.distinct_recipes} recipes</span>
          </div>
          {goals.budget_amount && (
            <div className={styles.stat}>
              <span className={styles.statValue}>${goals.budget_amount.toLocaleString()}</span>
              <span className={styles.statLabel}>budget · tracked from receipts</span>
            </div>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <ul className={styles.warnings}>
          {warnings.map((w) => (
            <li key={w}><Icon name="alert" size={15} /> {w}</li>
          ))}
        </ul>
      )}

      {weeks.map((week, wi) => (
        <section key={week[0]} className={styles.week}>
          {weeks.length > 1 && (
            <h2 className={styles.weekTitle}>
              Week {wi + 1} <span>{formatDate(week[0], 'MMM d')} – {formatDate(week[week.length - 1], 'MMM d')}</span>
            </h2>
          )}
          <div className={styles.dayList}>
            {week.map((date) => {
              const totals = dayTotals.get(date);
              const off = totals?.target ? (totals.calories - totals.target) / totals.target : 0;
              return (
                <div key={date} className={styles.dayRow}>
                  <div className={styles.dayLabel}>
                    <span className={styles.dayName}>{formatDate(date, 'EEE')}</span>
                    <span className={styles.dayNum}>{formatDate(date, 'd')}</span>
                    {totals && totals.calories > 0 && (
                      <span className={`${styles.dayCal} ${Math.abs(off) > 0.15 ? styles.dayCalOff : ''}`}>
                        {totals.calories.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className={styles.slots}>
                    {goals.meal_slots.map((slot) => {
                      const meal = mealAt.get(`${date}|${slot}`);
                      const r = meal ? recipes[meal.recipe_id] : undefined;
                      if (!meal || !r) {
                        return (
                          <button key={slot} className={styles.emptySlot} onClick={() => openPicker({ date, slot })}>
                            <Icon name="plus" size={14} strokeWidth={2.5} /> {slot}
                          </button>
                        );
                      }
                      const locked = !!meal.existing_id;
                      return (
                        <div key={slot} className={`${styles.meal} ${styles[`tone_${slot}`]} ${locked ? styles.mealLocked : ''}`}>
                          <button
                            className={styles.mealMain}
                            onClick={() => !locked && openPicker({ date, slot })}
                            disabled={locked}
                            title={locked ? 'Already on your calendar' : 'Swap this meal'}
                          >
                            {r.image_url ? (
                              <img src={resolveImageUrl(r.image_url)} alt="" className={styles.thumb} loading="lazy" />
                            ) : (
                              <span className={`${styles.thumb} ${styles.thumbEmpty}`}><Icon name="book" size={14} /></span>
                            )}
                            <span className={styles.mealText}>
                              <span className={styles.mealSlot}>
                                {slot}
                                {locked && <em> · already planned</em>}
                                {meal.pinned && !locked && <em> · your pick</em>}
                              </span>
                              <span className={styles.mealName}>{r.name}</span>
                              <span className={styles.mealMeta}>
                                {[
                                  r.calories ? `${r.calories} cal` : 'no cal info',
                                  r.protein ? `${Math.round(r.protein)}g protein` : '',
                                ].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </button>
                          {!locked && (
                            <button className={styles.mealRemove} onClick={() => removeMeal({ date, slot })} aria-label={`Remove ${r.name}`} title="Remove">
                              <Icon name="x" size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className={styles.saveBar}>
        <label className={styles.groceryToggle}>
          <input type="checkbox" checked={addToGrocery} onChange={(e) => setAddToGrocery(e.target.checked)} />
          <span>Add ingredients to my grocery list <em>(skips what's in your pantry)</em></span>
        </label>
        {error && <p className={styles.errorText}>{error}</p>}
        <button className="btn btn-primary" onClick={save} disabled={busy !== null || meals.filter((m) => !m.existing_id).length === 0}>
          <Icon name="check" size={17} strokeWidth={2.5} />
          {busy === 'save' ? 'Saving…' : `Save ${meals.filter((m) => !m.existing_id).length} meals`}
        </button>
      </div>

      {picker && (
        <div className={styles.overlay} onClick={() => setPicker(null)}>
          <div className={styles.picker} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pickerTitle">
            <div className={styles.pickerHeader}>
              <div>
                <h2 id="pickerTitle">Pick a {picker.slot}</h2>
                <p className={styles.subtitle}>{formatDate(picker.date, 'EEEE, MMM d')}</p>
              </div>
              <button className={styles.close} onClick={() => setPicker(null)} aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className={styles.pickerSearch}>
              <Icon name="search" size={16} />
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search your whole cookbook…"
                autoFocus
              />
            </div>
            {!pickerQuery && <p className={styles.pickerHint}>Best fits for your goals and the rest of the plan</p>}
            <div className={styles.pickerList}>
              {pickerLoading && !pickerQuery ? (
                <p className={styles.pickerHint}>Finding good fits…</p>
              ) : pickerList.length === 0 ? (
                <p className={styles.pickerHint}>{pickerQuery ? `No recipes match "${pickerQuery}"` : 'No recipes fit this meal yet.'}</p>
              ) : (
                pickerList.map((r) => (
                  <button key={r.id} className={styles.pickerItem} onClick={() => chooseRecipe(r)}>
                    {r.image_url ? (
                      <img src={resolveImageUrl(r.image_url)} alt="" className={styles.thumb} loading="lazy" />
                    ) : (
                      <span className={`${styles.thumb} ${styles.thumbEmpty}`}><Icon name="book" size={14} /></span>
                    )}
                    <span className={styles.mealText}>
                      <span className={styles.mealName}>{r.name}</span>
                      <span className={styles.mealMeta}>
                        {[
                          r.calories ? `${r.calories} cal` : 'no cal info',
                          r.protein ? `${Math.round(r.protein)}g protein` : '',
                          r.pantry_share >= 0.5 ? `${Math.round(r.pantry_share * 100)}% in pantry` : '',
                          r.is_favorite ? '♥ favorite' : '',
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Planner;
