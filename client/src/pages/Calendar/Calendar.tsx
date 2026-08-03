import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { calendarApi, recipesApi, mealsApi, budgetApi, MonthlyBudget } from '../../services/api';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formData, setFormData] = useState({
    recipe_id: '',
    meal_type: 'dinner',
    servings: '2',
    is_recurring: false,
    recurrence_pattern: 'weekly',
    recurrence_end_date: '',
  });
  const [recipeSearch, setRecipeSearch] = useState('');
  const [showRecipeDropdown, setShowRecipeDropdown] = useState(false);
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [editMealData, setEditMealData] = useState({ meal_type: 'dinner', servings: '2' });
  const [monthlyBudget, setMonthlyBudget] = useState<MonthlyBudget | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ budget_amount: '', calorie_budget: '', protein_goal: '', carbs_goal: '', fat_goal: '' });

  const monthDays = getMonthDays(currentDate);
  const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // Handle incoming selected date from navigation
  useEffect(() => {
    const state = location.state as { selectedDate?: string } | null;
    if (state?.selectedDate) {
      const date = new Date(state.selectedDate);
      setSelectedDate(date);
      setCurrentDate(date);
      setRecipeSearch('');
      setShowMealModal(true);
    }
  }, [location]);

  useEffect(() => {
    loadCalendarData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const loadCalendarData = async () => {
    try {
      setLoadError(null);
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
      setLoadError('Failed to load calendar. Please check your connection and try again.');
    }

    // Load budget separately so a failure here never blocks the calendar
    try {
      const budgetResponse = await budgetApi.getMonthly(currentMonth);
      setMonthlyBudget(budgetResponse.data);
    } catch (error) {
      console.error('Error loading monthly budget:', error);
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
    setRecipeSearch('');
    setShowMealModal(true);
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await budgetApi.createOrUpdateMonthly({
        month: currentMonth,
        budget_amount: parseFloat(budgetForm.budget_amount) || 0,
        calorie_budget: budgetForm.calorie_budget ? parseInt(budgetForm.calorie_budget) : undefined,
        protein_goal: budgetForm.protein_goal ? parseInt(budgetForm.protein_goal) : undefined,
        carbs_goal: budgetForm.carbs_goal ? parseInt(budgetForm.carbs_goal) : undefined,
        fat_goal: budgetForm.fat_goal ? parseInt(budgetForm.fat_goal) : undefined,
      });
      setMonthlyBudget(response.data);
      setEditingBudget(false);
      showNotification('success', 'Budget saved!');
    } catch (error) {
      console.error('Error saving monthly budget:', error);
      showNotification('error', 'Failed to save budget');
    }
  };

  const handleDeleteMeal = async (mealId: number) => {
    try {
      await mealsApi.delete(mealId);
      await loadCalendarData();
      setEditingMealId(null);
      showNotification('success', 'Meal removed');
    } catch (error) {
      console.error('Error deleting meal:', error);
      showNotification('error', 'Failed to remove meal');
    }
  };

  const handleStartEditMeal = (item: CombinedCalendarItem) => {
    setEditingMealId(item.id);
    setEditMealData({ meal_type: item.meal_type || 'dinner', servings: item.servings?.toString() || '2' });
  };

  const handleSaveEditMeal = async (mealId: number) => {
    try {
      await mealsApi.update(mealId, {
        meal_type: editMealData.meal_type,
        servings: parseInt(editMealData.servings),
      });
      await loadCalendarData();
      setEditingMealId(null);
      showNotification('success', 'Meal updated');
    } catch (error) {
      console.error('Error updating meal:', error);
      showNotification('error', 'Failed to update meal');
    }
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
        is_recurring: formData.is_recurring,
        recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : undefined,
        recurrence_end_date: formData.is_recurring && formData.recurrence_end_date ? formData.recurrence_end_date : undefined,
      });

      // Reload calendar data
      await loadCalendarData();

      // Close modal and reset
      setShowMealModal(false);
      setFormData({ recipe_id: '', meal_type: 'dinner', servings: '2', is_recurring: false, recurrence_pattern: 'weekly', recurrence_end_date: '' });
      setRecipeSearch('');
      showNotification('success', 'Meal scheduled successfully!');
    } catch (error) {
      console.error('Error scheduling meal:', error);
      showNotification('error', 'Failed to schedule meal');
    }
  };

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p>{loadError}</p>
          <button onClick={loadCalendarData} className={styles.retryButton}>Try Again</button>
        </div>
      </div>
    );
  }

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

      <div className={styles.budgetCard}>
        <div className={styles.budgetCardHeader}>
          <h2>Monthly Budget</h2>
          {!editingBudget && (
            <button
              onClick={() => {
                setBudgetForm({
                  budget_amount: monthlyBudget?.budget_amount?.toString() ?? '',
                  calorie_budget: monthlyBudget?.calorie_budget?.toString() ?? '',
                  protein_goal: monthlyBudget?.protein_goal?.toString() ?? '',
                  carbs_goal: monthlyBudget?.carbs_goal?.toString() ?? '',
                  fat_goal: monthlyBudget?.fat_goal?.toString() ?? '',
                });
                setEditingBudget(true);
              }}
              className={styles.editBudgetButton}
            >
              {monthlyBudget && monthlyBudget.budget_amount > 0 ? 'Edit' : 'Set Budget'}
            </button>
          )}
        </div>

        {editingBudget ? (
          <form onSubmit={handleSaveBudget} className={styles.budgetForm}>
            <div className={styles.budgetFormRow}>
              <label className={styles.budgetFormLabel}>
                Monthly Budget ($)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={budgetForm.budget_amount}
                  onChange={e => setBudgetForm({ ...budgetForm, budget_amount: e.target.value })}
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
                  onChange={e => setBudgetForm({ ...budgetForm, calorie_budget: e.target.value })}
                  className={styles.budgetInput}
                  placeholder="2000"
                />
              </label>
              <label className={styles.budgetFormLabel}>
                Daily Protein Goal (g)
                <input
                  type="number"
                  min="0"
                  value={budgetForm.protein_goal}
                  onChange={e => setBudgetForm({ ...budgetForm, protein_goal: e.target.value })}
                  className={styles.budgetInput}
                  placeholder="150"
                />
              </label>
              <label className={styles.budgetFormLabel}>
                Daily Carbs Goal (g)
                <input
                  type="number"
                  min="0"
                  value={budgetForm.carbs_goal}
                  onChange={e => setBudgetForm({ ...budgetForm, carbs_goal: e.target.value })}
                  className={styles.budgetInput}
                  placeholder="250"
                />
              </label>
              <label className={styles.budgetFormLabel}>
                Daily Fat Goal (g)
                <input
                  type="number"
                  min="0"
                  value={budgetForm.fat_goal}
                  onChange={e => setBudgetForm({ ...budgetForm, fat_goal: e.target.value })}
                  className={styles.budgetInput}
                  placeholder="65"
                />
              </label>
            </div>
            <div className={styles.budgetFormActions}>
              <button type="submit" className={styles.saveBudgetButton}>Save</button>
              <button type="button" onClick={() => setEditingBudget(false)} className={styles.cancelBudgetButton}>Cancel</button>
            </div>
          </form>
        ) : monthlyBudget && monthlyBudget.budget_amount > 0 ? (
          <>
            <div className={styles.budgetStats}>
              <div className={styles.budgetStat}>
                <span className={styles.budgetStatLabel}>Budget</span>
                <span className={styles.budgetStatValue}>${monthlyBudget.budget_amount.toFixed(2)}</span>
              </div>
              <div className={styles.budgetStat}>
                <span className={styles.budgetStatLabel}>Estimated</span>
                <span className={styles.budgetStatValue}>${monthlyBudget.estimated_cost.toFixed(2)}</span>
              </div>
              <div className={styles.budgetStat}>
                <span className={styles.budgetStatLabel}>Actual Spent</span>
                <span className={styles.budgetStatValue}>${monthlyBudget.actual_cost.toFixed(2)}</span>
              </div>
              <div className={styles.budgetStat}>
                <span className={styles.budgetStatLabel}>Remaining</span>
                <span className={`${styles.budgetStatValue} ${
                  monthlyBudget.budget_amount - monthlyBudget.actual_cost < 0 ? styles.overBudget : ''
                }`}>
                  ${(monthlyBudget.budget_amount - monthlyBudget.actual_cost).toFixed(2)}
                </span>
              </div>
            </div>
            <div className={styles.budgetBarWrap}>
              <div
                className={styles.budgetBarFill}
                style={{
                  width: `${Math.min((monthlyBudget.actual_cost / monthlyBudget.budget_amount) * 100, 100)}%`,
                  backgroundColor: monthlyBudget.actual_cost > monthlyBudget.budget_amount ? '#E74C3C' : '#8BAE66',
                }}
              />
            </div>
            {(monthlyBudget.calorie_budget || monthlyBudget.protein_goal || monthlyBudget.carbs_goal || monthlyBudget.fat_goal) && (
              <div className={styles.calorieGoal}>
                Daily goals:{' '}
                {monthlyBudget.calorie_budget && <span>{monthlyBudget.calorie_budget} cal</span>}
                {monthlyBudget.protein_goal && <span> · {monthlyBudget.protein_goal}g protein</span>}
                {monthlyBudget.carbs_goal && <span> · {monthlyBudget.carbs_goal}g carbs</span>}
                {monthlyBudget.fat_goal && <span> · {monthlyBudget.fat_goal}g fat</span>}
              </div>
            )}
          </>
        ) : (
          <p className={styles.noBudget}>No budget set for this month. Click "Set Budget" to get started.</p>
        )}
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
        <div className={styles.modalOverlay} onClick={() => { setShowMealModal(false); setEditingMealId(null); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Schedule Meal</h2>
              <button onClick={() => { setShowMealModal(false); setEditingMealId(null); }} className={styles.closeButton}>
                ×
              </button>
            </div>
            <p className={styles.selectedDateText}>
              {formatDate(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>

            {getItemsForDay(selectedDate).filter(i => i.type === 'meal').length > 0 && (
              <div className={styles.existingMeals}>
                <h3 className={styles.existingMealsTitle}>Scheduled meals</h3>
                {getItemsForDay(selectedDate).filter(i => i.type === 'meal').map(item => (
                  <div key={item.id} className={styles.existingMealRow}>
                    {editingMealId === item.id ? (
                      <div className={styles.inlineMealEdit}>
                        <select
                          value={editMealData.meal_type}
                          onChange={e => setEditMealData({ ...editMealData, meal_type: e.target.value })}
                          className={styles.inlineSelect}
                        >
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={editMealData.servings}
                          onChange={e => setEditMealData({ ...editMealData, servings: e.target.value })}
                          className={styles.inlineServingsInput}
                        />
                        <span className={styles.servingsLabel}>srv</span>
                        <button className={styles.inlineSaveButton} onClick={() => handleSaveEditMeal(item.id)}>✓</button>
                        <button className={styles.inlineCancelButton} onClick={() => setEditingMealId(null)}>✕</button>
                      </div>
                    ) : (
                      <>
                        <div className={styles.existingMealInfo}>
                          <span className={styles.existingMealType}>{item.meal_type}</span>
                          <span className={styles.existingMealTitle}>{item.title}</span>
                          <span className={styles.existingMealServings}>{item.servings} srv</span>
                        </div>
                        <div className={styles.existingMealActions}>
                          <button className={styles.inlineEditButton} onClick={() => handleStartEditMeal(item)} title="Edit">✎</button>
                          <button className={styles.inlineDeleteButton} onClick={() => handleDeleteMeal(item.id)} title="Delete">×</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleScheduleMeal} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="recipe">Recipe *</label>
                <div className={styles.recipeSearchWrap}>
                  <input
                    id="recipe"
                    type="text"
                    value={recipeSearch}
                    onChange={(e) => {
                      setRecipeSearch(e.target.value);
                      setShowRecipeDropdown(true);
                      if (formData.recipe_id) setFormData({ ...formData, recipe_id: '' });
                    }}
                    onFocus={() => setShowRecipeDropdown(true)}
                    onBlur={() => setShowRecipeDropdown(false)}
                    placeholder="Type to search recipes..."
                    className={styles.input}
                    autoComplete="off"
                  />
                  {showRecipeDropdown && (
                    <div className={styles.recipeDropdown}>
                      {recipes.filter(r => r.name.toLowerCase().includes(recipeSearch.toLowerCase().trim())).length === 0 ? (
                        <div className={styles.recipeDropdownEmpty}>No recipes match "{recipeSearch}"</div>
                      ) : (
                        recipes
                          .filter(r => r.name.toLowerCase().includes(recipeSearch.toLowerCase().trim()))
                          .slice(0, 50)
                          .map((recipe) => (
                            <button
                              type="button"
                              key={recipe.id}
                              className={styles.recipeDropdownItem}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setFormData({ ...formData, recipe_id: String(recipe.id) });
                                setRecipeSearch(recipe.name);
                                setShowRecipeDropdown(false);
                              }}
                            >
                              <span className={styles.recipeDropdownName}>{recipe.name}</span>
                              {recipe.category && <span className={styles.recipeDropdownCategory}>{recipe.category}</span>}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
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

              <div className={styles.formGroup}>
                <label className={styles.recurringLabel}>
                  <input
                    type="checkbox"
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                    className={styles.recurringCheckbox}
                  />
                  Repeat this meal
                </label>
              </div>

              {formData.is_recurring && (
                <>
                  <div className={styles.formGroup}>
                    <label htmlFor="recurrencePattern">Repeat</label>
                    <select
                      id="recurrencePattern"
                      value={formData.recurrence_pattern}
                      onChange={(e) => setFormData({ ...formData, recurrence_pattern: e.target.value })}
                      className={styles.select}
                    >
                      <option value="daily">Every day</option>
                      <option value="weekly">Every week</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Every month</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="recurrenceEnd">End Date (optional)</label>
                    <input
                      id="recurrenceEnd"
                      type="date"
                      value={formData.recurrence_end_date}
                      onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                      className={styles.input}
                    />
                  </div>
                </>
              )}

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
