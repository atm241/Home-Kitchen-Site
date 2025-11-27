import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { calendarApi, budgetApi } from '../../services/api';
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

  const weekDays = getWeekDays(currentDate);
  const weekStartDate = getWeekStartDate(currentDate);
  const weekEndDate = getWeekEndDate(currentDate);

  useEffect(() => {
    loadWeekData();
  }, [currentDate]);

  const loadWeekData = async () => {
    try {
      setLoading(true);
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
    // Navigate to calendar page with selected date
    navigate('/calendar', { state: { selectedDate: day.toISOString() } });
  };

  const budgetPercentage = budget
    ? (budget.estimated_cost / budget.budget_amount) * 100
    : 0;

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

      {budget && budget.budget_amount > 0 && (
        <div className={styles.budgetCard}>
          <h2>Weekly Budget</h2>
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
        </div>
      )}

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
                        style={{
                          borderLeftColor: getMealTypeColor(item.meal_type),
                        }}
                      >
                        <div className={styles.mealType}>
                          {item.meal_type || 'Event'}
                        </div>
                        <div className={styles.mealTitle}>{item.title}</div>
                        {item.servings && (
                          <div className={styles.mealServings}>
                            {item.servings} serving{item.servings > 1 ? 's' : ''}
                          </div>
                        )}
                        {item.calories && (
                          <div className={styles.mealCalories}>
                            {item.calories} cal
                          </div>
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
