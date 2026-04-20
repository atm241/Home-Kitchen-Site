import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { calendarApi, recipesApi, mealsApi } from '../../services/api';
import { CombinedCalendarItem, Recipe } from '../../types';
import {
  getMonthDays,
  formatDate,
  isSameDayUtil,
  isSameMonthUtil,
  nextMonth,
  prevMonth,
} from '../../utils/dateUtils';
import styles from './Calendar.module.css';

const Calendar: React.FC = () => {
  const location = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarItems, setCalendarItems] = useState<CombinedCalendarItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showMealModal, setShowMealModal] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formData, setFormData] = useState({
    recipe_id: '',
    meal_type: 'dinner',
    servings: '2',
  });

  const monthDays = getMonthDays(currentDate);

  // Handle incoming selected date from navigation
  useEffect(() => {
    const state = location.state as { selectedDate?: string } | null;
    if (state?.selectedDate) {
      const date = new Date(state.selectedDate);
      setSelectedDate(date);
      setCurrentDate(date);
      setShowMealModal(true);
    }
  }, [location]);

  useEffect(() => {
    loadCalendarData();
  }, [currentDate]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const firstDay = monthDays[0];
      const lastDay = monthDays[monthDays.length - 1];

      const [calendarResponse, recipesResponse] = await Promise.all([
        calendarApi.getCombined({
          start_date: formatDate(firstDay),
          end_date: formatDate(lastDay),
        }),
        recipesApi.getAll(),
      ]);

      setCalendarItems(calendarResponse.data);
      setRecipes(recipesResponse.data);
    } catch (error) {
      console.error('Error loading calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const getItemsForDay = (day: Date) => {
    return calendarItems.filter((item) => isSameDayUtil(item.date, day));
  };

  const handlePrevMonth = () => {
    setCurrentDate(prevMonth(currentDate));
  };

  const handleNextMonth = () => {
    setCurrentDate(nextMonth(currentDate));
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setShowMealModal(true);
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleScheduleMeal = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate || !formData.recipe_id) {
      showNotification('error', 'Please select a recipe');
      return;
    }

    try {
      await mealsApi.create({
        recipe_id: parseInt(formData.recipe_id),
        meal_date: formatDate(selectedDate),
        meal_type: formData.meal_type,
        servings: parseInt(formData.servings),
        is_recurring: false,
      });

      // Reload calendar data
      await loadCalendarData();

      // Close modal and reset
      setShowMealModal(false);
      setFormData({ recipe_id: '', meal_type: 'dinner', servings: '2' });
      showNotification('success', 'Meal scheduled successfully!');
    } catch (error) {
      console.error('Error scheduling meal:', error);
      showNotification('error', 'Failed to schedule meal');
    }
  };

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}
      <div className={styles.header}>
        <button onClick={handlePrevMonth} className={styles.navButton}>
          ← Previous
        </button>
        <h1>{formatDate(currentDate, 'MMMM yyyy')}</h1>
        <button onClick={handleNextMonth} className={styles.navButton}>
          Next →
        </button>
      </div>

      <div className={styles.calendar}>
        <div className={styles.weekDays}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className={styles.weekDay}>
              {day}
            </div>
          ))}
        </div>

        <div className={styles.daysGrid}>
          {monthDays.map((day) => {
            const items = getItemsForDay(day);
            const isToday = isSameDayUtil(day, new Date());
            const isCurrentMonth = isSameMonthUtil(day, currentDate);
            const isSelected = selectedDate && isSameDayUtil(day, selectedDate);

            return (
              <div
                key={day.toISOString()}
                className={`${styles.dayCell} ${
                  !isCurrentMonth ? styles.otherMonth : ''
                } ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''}`}
                onClick={() => handleDayClick(day)}
              >
                <div className={styles.dayNumber}>{formatDate(day, 'd')}</div>
                <div className={styles.dayItems}>
                  {items.slice(0, 3).map((item) => (
                    <div key={`${item.type}-${item.id}`} className={styles.item}>
                      {item.title}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className={styles.moreItems}>+{items.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showMealModal && selectedDate && (
        <div className={styles.modalOverlay} onClick={() => setShowMealModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Schedule Meal</h2>
              <button onClick={() => setShowMealModal(false)} className={styles.closeButton}>
                ×
              </button>
            </div>
            <p className={styles.selectedDateText}>
              {formatDate(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>
            <form onSubmit={handleScheduleMeal} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="recipe">Recipe *</label>
                <select
                  id="recipe"
                  value={formData.recipe_id}
                  onChange={(e) => setFormData({ ...formData, recipe_id: e.target.value })}
                  className={styles.select}
                  required
                >
                  <option value="">Select a recipe</option>
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="mealType">Meal Type *</label>
                <select
                  id="mealType"
                  value={formData.meal_type}
                  onChange={(e) => setFormData({ ...formData, meal_type: e.target.value })}
                  className={styles.select}
                  required
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="servings">Servings *</label>
                <input
                  id="servings"
                  type="number"
                  min="1"
                  value={formData.servings}
                  onChange={(e) => setFormData({ ...formData, servings: e.target.value })}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.modalActions}>
                <button type="button" onClick={() => setShowMealModal(false)} className={styles.cancelButton}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitButton}>
                  Schedule Meal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
