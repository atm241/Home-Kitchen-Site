import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { addDays } from 'date-fns';
import { calendarApi, mealsApi, budgetApi, pantryApi, plannerApi, MonthlyBudget, UseItUpResult, BudgetHistoryMonth, PlannerStatus } from '../../services/api';
import { CombinedCalendarItem } from '../../types';
import {
  getWeekDays,
  formatDate,
  getWeekStartDate,
  getWeekEndDate,
  isSameDayUtil,
} from '../../utils/dateUtils';
import Icon from '../../components/Icon/Icon';
import ViewToggle from '../../components/ViewToggle/ViewToggle';
import LogReceiptDialog from '../../components/LogReceipt/LogReceiptDialog';
import styles from './Home.module.css';

const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

const mealTone = (mealType?: string) => {
  switch (mealType?.toLowerCase()) {
    case 'breakfast': return styles.toneBreakfast;
    case 'lunch': return styles.toneLunch;
    case 'dinner': return styles.toneDinner;
    default: return styles.toneOther;
  }
};

const money = (n: number) => `$${n.toFixed(0)}`;

const Home: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const planSaved = (location.state as { planSaved?: { created: number; grocery_added: number } } | null)?.planSaved;
  const [weekOffset, setWeekOffset] = useState(0);
  const [planner, setPlanner] = useState<PlannerStatus | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [weekItems, setWeekItems] = useState<CombinedCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<MonthlyBudget | null>(null);
  const [useItUp, setUseItUp] = useState<UseItUpResult | null>(null);
  const [budgetHistory, setBudgetHistory] = useState<BudgetHistoryMonth[]>([]);

  const today = new Date();
  const anchor = addDays(today, weekOffset * 7);
  const weekDays = getWeekDays(anchor);
  const weekStartDate = getWeekStartDate(anchor);
  const weekEndDate = getWeekEndDate(anchor);
  const currentMonth = formatDate(today, 'yyyy-MM');

  const loadWeek = useCallback(async () => {
    try {
      setLoadError(null);
      const calResponse = await calendarApi.getCombined({ start_date: weekStartDate, end_date: weekEndDate });
      setWeekItems(calResponse.data);
    } catch (error) {
      console.error('Error loading week data:', error);
      setLoadError("Couldn't load this week. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [weekStartDate, weekEndDate]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  // Side cards only depend on today, so load them once.
  useEffect(() => {
    budgetApi.getMonthly(currentMonth).then((r) => setMonthlyBudget(r.data)).catch((e) => console.error('Error loading monthly budget:', e));
    pantryApi.useItUp(5).then((r) => setUseItUp(r.data)).catch((e) => console.error('Error loading use-it-up data:', e));
    budgetApi.getHistory(6).then((r) => setBudgetHistory(r.data)).catch((e) => console.error('Error loading budget history:', e));
    plannerApi.status().then((r) => setPlanner(r.data)).catch((e) => console.error('Error loading planner status:', e));
  }, [currentMonth]);

  const refreshSpend = () => {
    plannerApi.status().then((r) => setPlanner(r.data)).catch(() => {});
    budgetApi.getHistory(6).then((r) => setBudgetHistory(r.data)).catch(() => {});
    budgetApi.getMonthly(currentMonth).then((r) => setMonthlyBudget(r.data)).catch(() => {});
  };

  const getItemsForDay = (day: Date) =>
    weekItems
      .filter((item) => isSameDayUtil(item.date, day))
      .sort((a, b) => (MEAL_ORDER[a.meal_type?.toLowerCase() ?? ''] ?? 9) - (MEAL_ORDER[b.meal_type?.toLowerCase() ?? ''] ?? 9));

  const meals = weekItems.filter((i) => i.type === 'meal');
  const weekCalories = meals.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  const plannedDays = weekDays.filter((d) => getItemsForDay(d).length > 0).length;

  const handleAddMeal = (day: Date) => {
    navigate('/calendar', { state: { selectedDate: day.toISOString() } });
  };

  const handleDeleteMeal = async (item: CombinedCalendarItem) => {
    if (item.type !== 'meal') return;
    setWeekItems((items) => items.filter((i) => !(i.type === 'meal' && i.id === item.id)));
    try {
      await mealsApi.delete(item.id);
    } catch (error) {
      console.error('Error deleting meal:', error);
      loadWeek();
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading…</div>;
  }

  const dailyGoal = monthlyBudget?.calorie_budget || null;
  const weeklyCalorieGoal = dailyGoal ? dailyGoal * 7 : null;
  const caloriePct = weeklyCalorieGoal ? Math.min((weekCalories / weeklyCalorieGoal) * 100, 100) : null;
  const overCalories = weeklyCalorieGoal !== null && weekCalories > weeklyCalorieGoal;

  const weekLabel =
    weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : `Week of ${formatDate(weekDays[0], 'MMM d')}`;

  const budgetMax = Math.max(1, ...budgetHistory.map((r) => Math.max(r.actual_cost, r.budget_amount || r.estimated_cost)));
  const expiring = useItUp?.expiringItems ?? [];

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <h1>{weekLabel}</h1>
          <p className={styles.subtitle}>
            {formatDate(weekDays[0], 'MMM d')} – {formatDate(weekDays[6], 'MMM d')} · {meals.length} meal{meals.length === 1 ? '' : 's'} planned
            {plannedDays > 0 && <> across {plannedDays} day{plannedDays === 1 ? '' : 's'}</>}
          </p>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.weekNav}>
            <button className={styles.navArrow} onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
              <Icon name="chevronLeft" size={18} />
            </button>
            <button className={styles.todayBtn} onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              Today
            </button>
            <button className={styles.navArrow} onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
          <ViewToggle current="week" />
          <Link to="/plan/auto" className="btn btn-primary">
            <Icon name="sparkle" size={17} /> <span className={styles.toolLabel}>Auto-plan</span>
          </Link>
        </div>
      </header>

      {planSaved && (
        <div className={styles.savedStrip} role="status">
          <Icon name="check" size={18} strokeWidth={2.5} />
          <span>
            Added {planSaved.created} meal{planSaved.created === 1 ? '' : 's'}
            {planSaved.grocery_added > 0 && <> and {planSaved.grocery_added} grocery item{planSaved.grocery_added === 1 ? '' : 's'}</>}.
          </span>
          {planSaved.grocery_added > 0 && <Link to="/grocery" className={styles.savedLink}>Open grocery list</Link>}
        </div>
      )}

      {planner && !planner.saved && !planSaved && (
        <section className={styles.onboard}>
          <div className={styles.onboardText}>
            <span className={styles.onboardBadge}><Icon name="sparkle" size={14} /> New</span>
            <h2>Let Simmer plan your meals</h2>
            <p>
              Set a budget, a calorie goal and any protein or fiber targets. Simmer fills a week, two weeks or a month
              from your cookbook, then sends the ingredients to your grocery list.
            </p>
          </div>
          <Link to="/plan/auto" className="btn btn-primary">Get started</Link>
        </section>
      )}

      {loadError && (
        <div className={styles.errorState}>
          <span>{loadError}</span>
          <button onClick={loadWeek} className="btn btn-secondary">Try again</button>
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.week} aria-label="Meals by day">
          {weekDays.map((day) => {
            const items = getItemsForDay(day);
            const isToday = isSameDayUtil(day, today);
            const dayCalories = items.reduce((t, i) => t + (Number(i.calories) || 0), 0);

            return (
              <div key={day.toISOString()} className={`${styles.dayRow} ${isToday ? styles.today : ''}`}>
                <div className={styles.dayLabel}>
                  <span className={styles.dayName}>{formatDate(day, 'EEE')}</span>
                  <span className={styles.dayNum}>{formatDate(day, 'd')}</span>
                </div>

                <div className={styles.dayMeals}>
                  {items.length === 0 ? (
                    <button className={styles.emptyDay} onClick={() => handleAddMeal(day)}>
                      Nothing planned
                    </button>
                  ) : (
                    items.map((item) => (
                      <div key={`${item.type}-${item.id}`} className={`${styles.meal} ${mealTone(item.meal_type)}`}>
                        <div className={styles.mealText}>
                          <span className={styles.mealType}>{item.meal_type || 'Event'}</span>
                          {item.recipe_id ? (
                            <Link to={`/recipes/${item.recipe_id}`} className={styles.mealTitle}>{item.title}</Link>
                          ) : (
                            <span className={styles.mealTitle}>{item.title}</span>
                          )}
                          {(item.servings || item.calories) && (
                            <span className={styles.mealMeta}>
                              {[
                                item.servings ? `${item.servings} serving${item.servings > 1 ? 's' : ''}` : '',
                                item.calories ? `${item.calories} cal` : '',
                              ].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        {item.type === 'meal' && (
                          <button
                            className={styles.mealRemove}
                            onClick={() => handleDeleteMeal(item)}
                            aria-label={`Remove ${item.title}`}
                            title="Remove"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className={styles.dayEnd}>
                  {dayCalories > 0 && (
                    <span className={`${styles.dayCalories} ${dailyGoal && dayCalories > dailyGoal ? styles.over : ''}`}>
                      {dayCalories} cal
                    </span>
                  )}
                  <button className={styles.addMeal} onClick={() => handleAddMeal(day)} aria-label={`Add meal on ${formatDate(day, 'EEEE')}`} title="Add meal">
                    <Icon name="plus" size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            );
          })}

          {meals.length > 0 && (
            <div className={styles.weekFooter}>
              <Link to="/grocery" className="btn btn-primary">
                <Icon name="cart" size={17} /> Shop for this week
              </Link>
              <Link to="/history" className="btn btn-ghost">
                <Icon name="clock" size={16} /> Cook history
              </Link>
            </div>
          )}
        </section>

        <aside className={styles.side}>
          {planner?.budget && (() => {
            const b = planner.budget;
            const over = b.remaining < 0;
            const pct = Math.min(100, (b.spent / Math.max(1, b.amount)) * 100);
            return (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Grocery budget</h2>
                <div className={styles.bigStat}>
                  ${Math.abs(b.remaining).toFixed(0)}
                  <span className={styles.bigStatOf}> {over ? 'over' : 'left'} of ${b.amount.toFixed(0)}</span>
                </div>
                <div className={styles.bar}>
                  <div className={`${styles.barFill} ${over ? styles.barOver : ''}`} style={{ width: `${pct}%` }} />
                </div>
                <p className={styles.cardHint}>
                  {formatDate(b.start_date, 'MMM d')} – {formatDate(b.end_date, 'MMM d')} · ${b.spent.toFixed(2)} spent from receipts
                </p>
                <button className={`btn btn-secondary ${styles.cardButton}`} onClick={() => setShowReceipt(true)}>
                  <Icon name="receipt" size={15} /> Log receipt
                </button>
              </div>
            );
          })()}

          {(weeklyCalorieGoal || weekCalories > 0) && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Calories</h2>
              <div className={styles.bigStat}>
                {weekCalories.toLocaleString()}
                {weeklyCalorieGoal && <span className={styles.bigStatOf}> / {weeklyCalorieGoal.toLocaleString()}</span>}
              </div>
              {caloriePct !== null && (
                <div className={styles.bar}>
                  <div className={`${styles.barFill} ${overCalories ? styles.barOver : ''}`} style={{ width: `${caloriePct}%` }} />
                </div>
              )}
              <p className={styles.cardHint}>
                {weeklyCalorieGoal
                  ? overCalories
                    ? `${(weekCalories - weeklyCalorieGoal).toLocaleString()} over this week's goal`
                    : `${(weeklyCalorieGoal - weekCalories).toLocaleString()} left this week`
                  : <>Set a daily goal with <Link to="/plan/auto">Auto-plan</Link>.</>}
              </p>
            </div>
          )}

          {expiring.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <Icon name="clock" size={15} /> Use soon
              </h2>
              <div className={styles.chips}>
                {expiring.slice(0, 6).map((item) => (
                  <span
                    key={item.id}
                    className={`${styles.chip} ${item.days_until_expiry < 0 ? styles.chipExpired : item.days_until_expiry <= 2 ? styles.chipUrgent : ''}`}
                  >
                    {item.ingredient_name}
                    <span className={styles.chipDays}>
                      {item.days_until_expiry < 0 ? 'expired' : item.days_until_expiry === 0 ? 'today' : `${item.days_until_expiry}d`}
                    </span>
                  </span>
                ))}
              </div>
              {useItUp && useItUp.recipes.length > 0 && (
                <ul className={styles.recipeLinks}>
                  {useItUp.recipes.slice(0, 3).map((recipe) => (
                    <li key={recipe.id}>
                      <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
                      <span className={styles.recipeLinkMeta}>uses {recipe.expiring_ingredient_count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/pantry" className={styles.cardLink}>Open pantry <Icon name="chevronRight" size={14} /></Link>
            </div>
          )}

          {budgetHistory.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Grocery spend</h2>
              <ul className={styles.budgetList}>
                {budgetHistory.map((row) => {
                  const reference = row.budget_amount > 0 ? row.budget_amount : row.estimated_cost;
                  const over = row.actual_cost > reference && reference > 0;
                  const monthLabel = new Date(`${row.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' });
                  return (
                    <li key={row.month} className={styles.budgetRow}>
                      <span className={styles.budgetMonth}>{monthLabel}</span>
                      <div className={styles.budgetBarTrack}>
                        <div
                          className={`${styles.budgetBarFill} ${over ? styles.barOver : ''}`}
                          style={{ width: `${(row.actual_cost / budgetMax) * 100}%` }}
                        />
                        {reference > 0 && (
                          <div className={styles.budgetMarker} style={{ left: `${(reference / budgetMax) * 100}%` }} title={`Budget ${money(reference)}`} />
                        )}
                      </div>
                      <span className={`${styles.budgetAmount} ${over ? styles.over : ''}`}>{money(row.actual_cost)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.cardHint}>Bar is what you spent; the tick is your budget (or estimate).</p>
            </div>
          )}
        </aside>
      </div>

      {showReceipt && (
        <LogReceiptDialog
          onClose={() => setShowReceipt(false)}
          onSaved={() => { setShowReceipt(false); refreshSpend(); }}
        />
      )}
    </div>
  );
};

export default Home;
