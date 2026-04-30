import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { calendarApi, budgetApi, mealsApi } from '../../services/api';
import { CombinedCalendarItem, Budget } from '../../types';
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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekItems, setWeekItems] = useState<CombinedCalendarItem[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ budget_amount: '', calorie_budget: '' });
  const [budgetNotification, setBudgetNotification] = useState<string | null>(null);

  const weekDays = getWeekDays(currentDate);
  const weekStartDate = getWeekStartDate(currentDate);
  const weekEndDate = getWeekEndDate(currentDate);

  useEffect(() => {
    loadWeekData();
  }, [currentDate]);

  const loadWeekData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [calendarResponse, budgetResponse] = await Promise.all([
        calendarApi.getCombined({
          start_date: weekStartDate,
          end_date: weekEndDate,
        }),
        budgetApi.get(weekStartDate),
      ]);

      setWeekItems(calendarResponse.data);
      setBudget(budgetResponse.data);
    } catch (error) {
      console.error('Error loading week data:', error);
      setLoadError('Failed to load this week\'s data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const getItemsForDay = (day: Date) => {
    return weekItems.filter((item) => isSameDayUtil(item.date, day));
  };

  const getCaloriesForDay = (day: Date) => {
    const items = getItemsForDay(day);
    return items.reduce((total, item) => {
      return total + (item.calories || 0);
    }, 0);
  };

  const getMealTypeColor = (mealType?: string) => {
    switch (mealType?.toLowerCase()) {
      case 'breakfast':
        return '#E67E22';
      case 'lunch':
        return '#8BAE66';
      case 'dinner':
        return '#628141';
      default:
        return '#7F8C8D';
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

  const handleEditBudget = () => {
    setBudgetForm({
      budget_amount: budget?.budget_amount ? budget.budget_amount.toString() : '',
      calorie_budget: budget?.calorie_budget ? budget.calorie_budget.toString() : '',
    });
    setEditingBudget(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await budgetApi.createOrUpdate({
        week_start_date: weekStartDate,
        budget_amount: parseFloat(budgetForm.budget_amount) || 0,
        calorie_budget: budgetForm.calorie_budget ? parseInt(budgetForm.calorie_budget, 10) : undefined,
      });
      setBudget(response.data);
      setEditingBudget(false);
      setBudgetNotification('Budget saved!');
      setTimeout(() => setBudgetNotification(null), 3000);
    } catch (error) {
      console.error('Error saving budget:', error);
      setBudgetNotification('Failed to save budget.');
      setTimeout(() => setBudgetNotification(null), 3000);
    }
  };

  const budgetPercentage = budget && budget.budget_amount > 0
    ? (budget.estimated_cost / budget.budget_amount) * 100
    : 0;

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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>This Week</h1>
        <div className={styles.headerActions}>
          <Link to="/calendar" className={styles.link}>
            View Full Calendar
          </Link>
        </div>
      </div>

      <div className={styles.budgetCard}>
        <div className={styles.budgetCardHeader}>
          <h2>Weekly Budget</h2>
          {!editingBudget && (
            <button onClick={handleEditBudget} className={styles.editBudgetButton}>
              {budget && budget.budget_amount > 0 ? 'Edit' : 'Set Budget'}
            </button>
          )}
        </div>
        {budgetNotification && (
          <p className={styles.budgetNotification}>{budgetNotification}</p>
        )}
        {editingBudget ? (
          <form onSubmit={handleSaveBudget} className={styles.budgetForm}>
            <div className={styles.budgetFormRow}>
              <label className={styles.budgetFormLabel}>
                Weekly Budget ($)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={budgetForm.budget_amount}
                  onChange={(e) => setBudgetForm({ ...budgetForm, budget_amount: e.target.value })}
                  className={styles.budgetInput}
                  placeholder="0.00"
                  autoFocus
                />
              </label>
              <label className={styles.budgetFormLabel}>
                Daily Calorie Goal
                <input
                  type="number"
                  min="0"
                  value={budgetForm.calorie_budget}
                  onChange={(e) => setBudgetForm({ ...budgetForm, calorie_budget: e.target.value })}
                  className={styles.budgetInput}
                  placeholder="2000"
                />
              </label>
            </div>
            <div className={styles.budgetFormActions}>
              <button type="submit" className={styles.saveBudgetButton}>Save</button>
              <button type="button" onClick={() => setEditingBudget(false)} className={styles.cancelBudgetButton}>Cancel</button>
            </div>
          </form>
        ) : budget && budget.budget_amount > 0 ? (
          <>
            <div className={styles.budgetInfo}>
              <div className={styles.budgetItem}>
                <span className={styles.budgetLabel}>Budget:</span>
                <span className={styles.budgetValue}>${budget.budget_amount.toFixed(2)}</span>
              </div>
              <div className={styles.budgetItem}>
                <span className={styles.budgetLabel}>Estimated:</span>
                <span className={styles.budgetValue}>${budget.estimated_cost.toFixed(2)}</span>
              </div>
              <div className={styles.budgetItem}>
                <span className={styles.budgetLabel}>Remaining:</span>
                <span className={styles.budgetValue}>
                  ${(budget.budget_amount - budget.estimated_cost).toFixed(2)}
                </span>
              </div>
            </div>
            <div className={styles.budgetBar}>
              <div
                className={styles.budgetProgress}
                style={{
                  width: `${Math.min(budgetPercentage, 100)}%`,
                  backgroundColor: budgetPercentage > 100 ? '#E74C3C' : '#8BAE66',
                }}
              />
            </div>
          </>
        ) : (
          <p className={styles.noBudget}>No budget set for this week. Click "Set Budget" to get started.</p>
        )}
      </div>

      <div className={styles.weekGrid}>
        {weekDays.map((day) => {
          const items = getItemsForDay(day);
          const isToday = isSameDayUtil(day, new Date());
          const dayCalories = getCaloriesForDay(day);
          const dailyCalorieBudget = budget?.calorie_budget || 2000;

          return (
            <div
              key={day.toISOString()}
              className={`${styles.dayCard} ${isToday ? styles.today : ''}`}
            >
              <div className={styles.dayHeader}>
                <div className={styles.dayName}>{formatDate(day, 'EEEE')}</div>
                <div className={styles.dayDate}>{formatDate(day, 'MMM d')}</div>
                <button
                  onClick={() => handleAddMeal(day)}
                  className={styles.addMealButton}
                  title="Add meal"
                >
                  +
                </button>
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
                            <button
                              className={styles.deleteMealButton}
                              onClick={(e) => handleDeleteMeal(e, item)}
                              title="Remove meal"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className={styles.mealTitle}>{item.title}</div>
                        {item.servings && (
                          <div className={styles.mealServings}>
                            {item.servings} serving{item.servings > 1 ? 's' : ''}
                          </div>
                        )}
                        {item.calories && (
                          <div className={styles.mealCalories}>{item.calories} cal</div>
                        )}
                      </div>
                    ))}
                    {dayCalories > 0 && (
                      <div className={styles.dayCalorieTotal}>
                        <span className={styles.calorieLabel}>Total:</span>
                        <span className={`${styles.calorieValue} ${
                          dayCalories > dailyCalorieBudget ? styles.overBudget : ''
                        }`}>
                          {dayCalories} / {dailyCalorieBudget} cal
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
        </div>
      </div>
    </div>
  );
};

export default Home;
