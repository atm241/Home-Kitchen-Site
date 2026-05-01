import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { calendarApi, mealsApi } from '../../services/api';
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

  const weekDays = getWeekDays(currentDate);
  const weekStartDate = getWeekStartDate(currentDate);
  const weekEndDate = getWeekEndDate(currentDate);

  useEffect(() => {
    loadWeekData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWeekData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await calendarApi.getCombined({
        start_date: weekStartDate,
        end_date: weekEndDate,
      });
      setWeekItems(response.data);
    } catch (error) {
      console.error('Error loading week data:', error);
      setLoadError("Failed to load this week's data. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const getItemsForDay = (day: Date) => {
    return weekItems.filter((item) => isSameDayUtil(item.date, day));
  };

  const getCaloriesForDay = (day: Date) => {
    return getItemsForDay(day).reduce((total, item) => total + (item.calories || 0), 0);
  };

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

      <div className={styles.weekGrid}>
        {weekDays.map((day) => {
          const items = getItemsForDay(day);
          const isToday = isSameDayUtil(day, new Date());
          const dayCalories = getCaloriesForDay(day);

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
                        <span className={styles.calorieValue}>{dayCalories} cal</span>
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
