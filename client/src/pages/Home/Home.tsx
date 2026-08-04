import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { calendarApi, mealsApi, budgetApi, pantryApi, MonthlyBudget, UseItUpResult, BudgetHistoryMonth } from '../../services/api';
import { CombinedCalendarItem } from '../../types';
import {
  getWeekDays,
  formatDate,
  getWeekStartDate,
  getWeekEndDate,
  isSameDayUtil,
} from '../../utils/dateUtils';
import styles from './Home.module.css';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate] = useState(new Date());
  const [weekItems, setWeekItems] = useState<CombinedCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<MonthlyBudget | null>(null);
  const [useItUp, setUseItUp] = useState<UseItUpResult | null>(null);
  const [budgetHistory, setBudgetHistory] = useState<BudgetHistoryMonth[]>([]);

  const weekGridRef = useRef<HTMLDivElement>(null);

  const weekDays = getWeekDays(currentDate);
  const weekStartDate = getWeekStartDate(currentDate);
  const weekEndDate = getWeekEndDate(currentDate);
  const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    loadWeekData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll week grid to today's card on mobile after data loads
  useEffect(() => {
    if (!loading && weekGridRef.current) {
      const todayEl = weekGridRef.current.querySelector(`.${styles.today}`) as HTMLElement | null;
      if (todayEl) {
        weekGridRef.current.scrollLeft = todayEl.offsetLeft - weekGridRef.current.offsetLeft;
      }
    }
  }, [loading]);

  const loadWeekData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [calResponse] = await Promise.all([
        calendarApi.getCombined({ start_date: weekStartDate, end_date: weekEndDate }),
      ]);
      setWeekItems(calResponse.data);
    } catch (error) {
      console.error('Error loading week data:', error);
      setLoadError("Failed to load this week's data. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }

    try {
      const budgetResponse = await budgetApi.getMonthly(currentMonth);
      setMonthlyBudget(budgetResponse.data);
    } catch (error) {
      console.error('Error loading monthly budget:', error);
    }

    try {
      const useItUpResponse = await pantryApi.useItUp(5);
      setUseItUp(useItUpResponse.data);
    } catch (error) {
      console.error('Error loading use-it-up data:', error);
    }

    try {
      const historyResponse = await budgetApi.getHistory(6);
      setBudgetHistory(historyResponse.data);
    } catch (error) {
      console.error('Error loading budget history:', error);
    }
  };

  const getItemsForDay = (day: Date) => weekItems.filter((item) => isSameDayUtil(item.date, day));

  const getCaloriesForDay = (day: Date) =>
    getItemsForDay(day).reduce((total, item) => total + (Number(item.calories) || 0), 0);

  // Weekly nutrition totals from scheduled meals
  const weekTotals = weekItems
    .filter(i => i.type === 'meal')
    .reduce(
      (acc, item) => ({
        calories: acc.calories + (Number(item.calories) || 0),
      }),
      { calories: 0 }
    );

  const getMealTypeColor = (mealType?: string) => {
    switch (mealType?.toLowerCase()) {
      case 'breakfast': return '#E67E22';
      case 'lunch':     return '#8BAE66';
      case 'dinner':    return '#628141';
      default:          return '#7F8C8D';
    }
  };

  const handleAddMeal = (day: Date) => {
    navigate('/calendar', { state: { selectedDate: day.toISOString() } });
  };

  const handleDeleteMeal = async (e: React.MouseEvent, item: CombinedCalendarItem) => {
    e.stopPropagation();
    if (item.type !== 'meal') return;
    try {
      await mealsApi.delete(item.id);
      await loadWeekData();
    } catch (error) {
      console.error('Error deleting meal:', error);
    }
  };

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p>{loadError}</p>
          <button onClick={loadWeekData} className={styles.retryButton}>Try Again</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>Loading...</div></div>;
  }

  // Calorie goal = monthly calorie_budget (as daily) * 7
  const weeklyCalorieGoal = monthlyBudget?.calorie_budget ? monthlyBudget.calorie_budget * 7 : null;
  const caloriePct = weeklyCalorieGoal ? Math.min((weekTotals.calories / weeklyCalorieGoal) * 100, 100) : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>This Week</h1>
        <div className={styles.headerActions}>
          <Link to="/history" className={styles.link}>Cook History</Link>
          <Link to="/calendar" className={styles.link}>Full Calendar</Link>
        </div>
      </div>

      {/* Nutrition summary card */}
      {(weeklyCalorieGoal || weekTotals.calories > 0) && (
        <div className={styles.nutritionCard}>
          <h2 className={styles.nutritionCardTitle}>Weekly Nutrition</h2>
          <div className={styles.nutritionStats}>
            <div className={styles.nutritionStat}>
              <span className={styles.nutritionStatValue}>{weekTotals.calories}</span>
              <span className={styles.nutritionStatLabel}>Calories this week</span>
            </div>
            {weeklyCalorieGoal && (
              <div className={styles.nutritionStat}>
                <span className={styles.nutritionStatValue}>{weeklyCalorieGoal}</span>
                <span className={styles.nutritionStatLabel}>Weekly goal</span>
              </div>
            )}
            {weeklyCalorieGoal && (
              <div className={styles.nutritionStat}>
                <span className={styles.nutritionStatValue} style={{ color: weekTotals.calories > weeklyCalorieGoal ? '#e74c3c' : '#628141' }}>
                  {weeklyCalorieGoal - weekTotals.calories > 0 ? `${weeklyCalorieGoal - weekTotals.calories} left` : `${weekTotals.calories - weeklyCalorieGoal} over`}
                </span>
                <span className={styles.nutritionStatLabel}>Remaining</span>
              </div>
            )}
          </div>
          {caloriePct !== null && (
            <div className={styles.nutritionBarWrap}>
              <div
                className={styles.nutritionBarFill}
                style={{
                  width: `${caloriePct}%`,
                  backgroundColor: weekTotals.calories > weeklyCalorieGoal! ? '#e74c3c' : '#628141',
                }}
              />
            </div>
          )}
          {!weeklyCalorieGoal && (
            <p className={styles.nutritionHint}>
              Set a daily calorie goal in <Link to="/calendar" className={styles.nutritionLink}>Calendar → Monthly Budget</Link> to track progress.
            </p>
          )}
        </div>
      )}

      {/* Use It Up card */}
      {useItUp && useItUp.expiringItems.length > 0 && (
        <div className={styles.useItUpCard}>
          <div className={styles.useItUpCardHeader}>
            <span className={styles.useItUpIcon}>🕐</span>
            <div>
              <h2 className={styles.useItUpTitle}>Use It Up</h2>
              <p className={styles.useItUpSubtitle}>
                {useItUp.expiringItems.length} ingredient{useItUp.expiringItems.length > 1 ? 's' : ''} expiring within 5 days
              </p>
            </div>
            <Link to="/pantry" className={styles.useItUpViewAll}>View all →</Link>
          </div>
          <div className={styles.useItUpIngredients}>
            {useItUp.expiringItems.slice(0, 6).map(item => (
              <span
                key={item.id}
                className={`${styles.useItUpChip} ${item.days_until_expiry < 0 ? styles.useItUpChipExpired : item.days_until_expiry <= 2 ? styles.useItUpChipUrgent : styles.useItUpChipSoon}`}
              >
                {item.ingredient_name}
                <span className={styles.useItUpChipDays}>
                  {item.days_until_expiry < 0 ? 'expired' : item.days_until_expiry === 0 ? 'today' : `${item.days_until_expiry}d`}
                </span>
              </span>
            ))}
          </div>
          {useItUp.recipes.length > 0 && (
            <div className={styles.useItUpRecipeRow}>
              <span className={styles.useItUpRecipeLabel}>Recipes that can help:</span>
              {useItUp.recipes.slice(0, 3).map(recipe => (
                <Link key={recipe.id} to={`/recipes/${recipe.id}`} className={styles.useItUpRecipeLink}>
                  {recipe.name}
                  <span className={styles.useItUpRecipeCount}>({recipe.expiring_ingredient_count} expiring)</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Budget history card */}
      {budgetHistory.length > 0 && (
        <div className={styles.budgetHistoryCard}>
          <h2 className={styles.budgetHistoryTitle}>Budget History</h2>
          <div className={styles.budgetHistoryTableWrap}>
            <table className={styles.budgetHistoryTable}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Budget</th>
                  <th>Estimated</th>
                  <th>Actual</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {budgetHistory.map(row => {
                  const reference = row.budget_amount > 0 ? row.budget_amount : row.estimated_cost;
                  const diff = reference - row.actual_cost;
                  const monthLabel = new Date(`${row.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                  return (
                    <tr key={row.month}>
                      <td>{monthLabel}</td>
                      <td>{row.budget_amount > 0 ? `$${row.budget_amount.toFixed(2)}` : '—'}</td>
                      <td>${row.estimated_cost.toFixed(2)}</td>
                      <td>${row.actual_cost.toFixed(2)}</td>
                      <td style={{ color: diff >= 0 ? '#628141' : '#e74c3c', fontWeight: 600 }}>
                        {diff >= 0 ? `$${diff.toFixed(2)} under` : `$${Math.abs(diff).toFixed(2)} over`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div ref={weekGridRef} className={styles.weekGrid}>
        {weekDays.map((day) => {
          const items = getItemsForDay(day);
          const isToday = isSameDayUtil(day, new Date());
          const dayCalories = getCaloriesForDay(day);
          const dailyGoal = monthlyBudget?.calorie_budget || null;

          return (
            <div
              key={day.toISOString()}
              className={`${styles.dayCard} ${isToday ? styles.today : ''}`}
            >
              <div className={styles.dayHeader}>
                <div className={styles.dayName}>{formatDate(day, 'EEEE')}</div>
                <div className={styles.dayDate}>{formatDate(day, 'MMM d')}</div>
                <button onClick={() => handleAddMeal(day)} className={styles.addMealButton} title="Add meal">+</button>
              </div>
              <div className={styles.dayContent}>
                {items.length === 0 ? (
                  <div className={styles.noMeals}>No meals scheduled</div>
                ) : (
                  <>
                    {items.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className={styles.mealItem}
                        style={{ borderLeftColor: getMealTypeColor(item.meal_type) }}
                      >
                        <div className={styles.mealItemHeader}>
                          <div className={styles.mealType}>{item.meal_type || 'Event'}</div>
                          {item.type === 'meal' && (
                            <button className={styles.deleteMealButton} onClick={(e) => handleDeleteMeal(e, item)} title="Remove meal">×</button>
                          )}
                        </div>
                        <div className={styles.mealTitle}>{item.title}</div>
                        {item.servings && <div className={styles.mealServings}>{item.servings} serving{item.servings > 1 ? 's' : ''}</div>}
                        {item.calories && <div className={styles.mealCalories}>{item.calories} cal</div>}
                      </div>
                    ))}
                    {dayCalories > 0 && (
                      <div className={styles.dayCalorieTotal}>
                        <span className={styles.calorieLabel}>Total:</span>
                        <span
                          className={styles.calorieValue}
                          style={{ color: dailyGoal && dayCalories > dailyGoal ? '#e74c3c' : undefined }}
                        >
                          {dayCalories} cal{dailyGoal ? ` / ${dailyGoal}` : ''}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.quickActions}>
        <h2>Quick Actions</h2>
        <div className={styles.actionGrid}>
          <Link to="/recipes" className={styles.actionCard}>
            <h3>Browse Recipes</h3>
            <p>Find new meals to add to your calendar</p>
          </Link>
          <Link to="/grocery" className={styles.actionCard}>
            <h3>Grocery List</h3>
            <p>View and manage your shopping list</p>
          </Link>
          <Link to="/pantry" className={styles.actionCard}>
            <h3>Pantry</h3>
            <p>Check what ingredients you have</p>
          </Link>
          <Link to="/history" className={styles.actionCard}>
            <h3>Cook History</h3>
            <p>See what you've been cooking</p>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
