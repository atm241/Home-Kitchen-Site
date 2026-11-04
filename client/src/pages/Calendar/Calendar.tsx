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
import Icon from '../../components/Icon/Icon';
import ViewToggle from '../../components/ViewToggle/ViewToggle';
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

  const closeModal = () => {
    setShowMealModal(false);
    setEditingMealId(null);
  };

  const startEditBudget = () => {
    setBudgetForm({
      budget_amount: monthlyBudget?.budget_amount?.toString() ?? '',
      calorie_budget: monthlyBudget?.calorie_budget?.toString() ?? '',
      protein_goal: monthlyBudget?.protein_goal?.toString() ?? '',
      carbs_goal: monthlyBudget?.carbs_goal?.toString() ?? '',
      fat_goal: monthlyBudget?.fat_goal?.toString() ?? '',
    });
    setEditingBudget(true);
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

  const BUDGET_FIELDS: Array<{ key: keyof typeof budgetForm; label: string; placeholder: string; step?: string }> = [
    { key: 'budget_amount', label: 'Grocery budget ($/month)', placeholder: '400', step: '0.01' },
    { key: 'calorie_budget', label: 'Calories / day', placeholder: '2000' },
    { key: 'protein_goal', label: 'Protein (g/day)', placeholder: '150' },
    { key: 'carbs_goal', label: 'Carbs (g/day)', placeholder: '250' },
    { key: 'fat_goal', label: 'Fat (g/day)', placeholder: '65' },
  ];

  const hasBudget = !!monthlyBudget && monthlyBudget.budget_amount > 0;
  const spentPct = hasBudget ? Math.min((monthlyBudget!.actual_cost / monthlyBudget!.budget_amount) * 100, 100) : 0;
  const overBudget = hasBudget && monthlyBudget!.actual_cost > monthlyBudget!.budget_amount;
  const goals = monthlyBudget
    ? [
        monthlyBudget.calorie_budget ? `${monthlyBudget.calorie_budget} cal` : '',
        monthlyBudget.protein_goal ? `${monthlyBudget.protein_goal}g protein` : '',
        monthlyBudget.carbs_goal ? `${monthlyBudget.carbs_goal}g carbs` : '',
        monthlyBudget.fat_goal ? `${monthlyBudget.fat_goal}g fat` : '',
      ].filter(Boolean)
    : [];

  const matchingRecipes = recipes.filter((r) => r.name.toLowerCase().includes(recipeSearch.toLowerCase().trim()));
  const selectedDayMeals = selectedDate ? getItemsForDay(selectedDate).filter((i) => i.type === 'meal') : [];

  const mealTone = (mealType?: string) => {
    switch (mealType?.toLowerCase()) {
      case 'breakfast': return styles.toneBreakfast;
      case 'lunch': return styles.toneLunch;
      case 'dinner': return styles.toneDinner;
      default: return styles.toneOther;
    }
  };

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`} role="status">
          {notification.message}
        </div>
      )}

      <header className={styles.pageHeader}>
        <h1>{formatDate(currentDate, 'MMMM yyyy')}</h1>
        <div className={styles.headerTools}>
        <ViewToggle current="month" />
        <div className={styles.monthNav}>
          <button onClick={handlePrevMonth} className={styles.navArrow} aria-label="Previous month">
            <Icon name="chevronLeft" size={18} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className={styles.todayBtn}
            disabled={isSameMonthUtil(currentDate, new Date())}
          >
            Today
          </button>
          <button onClick={handleNextMonth} className={styles.navArrow} aria-label="Next month">
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
        </div>
      </header>

      {loadError && (
        <div className={styles.errorState}>
          <span>{loadError}</span>
          <button onClick={loadCalendarData} className="btn btn-secondary">Try again</button>
        </div>
      )}

      <section className={styles.budgetCard}>
        {editingBudget ? (
          <form onSubmit={handleSaveBudget} className={styles.budgetForm}>
            <div className={styles.budgetFormGrid}>
              {BUDGET_FIELDS.map((f, i) => (
                <label key={f.key} className={styles.budgetFormLabel}>
                  {f.label}
                  <input
                    type="number"
                    min="0"
                    step={f.step}
                    inputMode={f.step ? 'decimal' : 'numeric'}
                    value={budgetForm[f.key]}
                    onChange={(e) => setBudgetForm({ ...budgetForm, [f.key]: e.target.value })}
                    className={styles.input}
                    placeholder={f.placeholder}
                    autoFocus={i === 0}
                  />
                </label>
              ))}
            </div>
            <div className={styles.formActions}>
              <button type="button" onClick={() => setEditingBudget(false)} className="btn btn-ghost">Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        ) : (
          <div className={styles.budgetSummary}>
            <div className={styles.budgetMain}>
              {hasBudget ? (
                <>
                  <div className={styles.budgetLine}>
                    <span className={styles.budgetSpent}>${monthlyBudget!.actual_cost.toFixed(0)}</span>
                    <span className={styles.budgetOf}>of ${monthlyBudget!.budget_amount.toFixed(0)} spent</span>
                    <span className={`${styles.budgetLeft} ${overBudget ? styles.over : ''}`}>
                      {overBudget
                        ? `$${(monthlyBudget!.actual_cost - monthlyBudget!.budget_amount).toFixed(0)} over`
                        : `$${(monthlyBudget!.budget_amount - monthlyBudget!.actual_cost).toFixed(0)} left`}
                    </span>
                  </div>
                  <div className={styles.bar}>
                    <div className={`${styles.barFill} ${overBudget ? styles.barOver : ''}`} style={{ width: `${spentPct}%` }} />
                  </div>
                  <div className={styles.budgetMeta}>
                    <span>Planned meals ≈ ${monthlyBudget!.estimated_cost.toFixed(0)}</span>
                    {goals.length > 0 && <span>Daily goals: {goals.join(' · ')}</span>}
                  </div>
                </>
              ) : (
                <div className={styles.noBudget}>
                  <strong>No budget for {formatDate(currentDate, 'MMMM')}.</strong>{' '}
                  Set a grocery budget and daily nutrition goals to track them here and on Plan.
                </div>
              )}
            </div>
            <button onClick={startEditBudget} className={`btn btn-secondary ${styles.smallBtn}`}>
              <Icon name="edit" size={15} /> {hasBudget ? 'Edit' : 'Set budget'}
            </button>
          </div>
        )}
      </section>

      <section className={styles.calendar}>
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
            const isSelected = showMealModal && selectedDate && isSameDayUtil(day, selectedDate);

            return (
              <button
                type="button"
                key={day.toISOString()}
                className={`${styles.dayCell} ${!isCurrentMonth ? styles.otherMonth : ''} ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''}`}
                onClick={() => handleDayClick(day)}
                aria-label={`${formatDate(day, 'EEEE, MMMM d')}: ${items.length} planned`}
              >
                <span className={styles.dayNumber}>{formatDate(day, 'd')}</span>
                <span className={styles.dayItems}>
                  {items.slice(0, 3).map((item) => (
                    <span key={`${item.type}-${item.id}`} className={`${styles.item} ${mealTone(item.meal_type)}`}>
                      {item.title}
                    </span>
                  ))}
                  {items.length > 3 && <span className={styles.moreItems}>+{items.length - 3} more</span>}
                </span>
                {items.length > 0 && (
                  <span className={styles.dots} aria-hidden="true">
                    {items.slice(0, 4).map((item) => (
                      <span key={`${item.type}-${item.id}`} className={`${styles.dot} ${mealTone(item.meal_type)}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div className={styles.legend}>
        <span><i className={`${styles.dot} ${styles.toneBreakfast}`} /> Breakfast</span>
        <span><i className={`${styles.dot} ${styles.toneLunch}`} /> Lunch</span>
        <span><i className={`${styles.dot} ${styles.toneDinner}`} /> Dinner</span>
        <span className={styles.legendHint}>Tap a day to plan a meal</span>
      </div>

      {showMealModal && selectedDate && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mealModalTitle">
            <div className={styles.modalHeader}>
              <div>
                <h2 id="mealModalTitle">{formatDate(selectedDate, 'EEEE')}</h2>
                <p className={styles.selectedDateText}>{formatDate(selectedDate, 'MMMM d, yyyy')}</p>
              </div>
              <button onClick={closeModal} className={styles.closeButton} aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>

            {selectedDayMeals.length > 0 && (
              <div className={styles.existingMeals}>
                {selectedDayMeals.map((item) => (
                  <div key={item.id} className={`${styles.existingMealRow} ${mealTone(item.meal_type)}`}>
                    {editingMealId === item.id ? (
                      <div className={styles.inlineMealEdit}>
                        <select
                          value={editMealData.meal_type}
                          onChange={(e) => setEditMealData({ ...editMealData, meal_type: e.target.value })}
                          className={styles.inlineSelect}
                          aria-label="Meal"
                        >
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={editMealData.servings}
                          onChange={(e) => setEditMealData({ ...editMealData, servings: e.target.value })}
                          className={styles.inlineServingsInput}
                          aria-label="Servings"
                        />
                        <span className={styles.servingsLabel}>servings</span>
                        <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => handleSaveEditMeal(item.id)} aria-label="Save">
                          <Icon name="check" size={16} strokeWidth={2.5} />
                        </button>
                        <button className={styles.iconBtn} onClick={() => setEditingMealId(null)} aria-label="Cancel">
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className={styles.existingMealInfo}>
                          <span className={styles.existingMealType}>{item.meal_type}</span>
                          <span className={styles.existingMealTitle}>{item.title}</span>
                          {item.servings && <span className={styles.existingMealServings}>{item.servings} servings</span>}
                        </div>
                        <div className={styles.existingMealActions}>
                          <button className={styles.iconBtn} onClick={() => handleStartEditMeal(item)} aria-label={`Edit ${item.title}`}>
                            <Icon name="edit" size={15} />
                          </button>
                          <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDeleteMeal(item.id)} aria-label={`Remove ${item.title}`}>
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleScheduleMeal} className={styles.form}>
              <h3 className={styles.formTitle}>Add a meal</h3>
              <div className={styles.formGroup}>
                <label htmlFor="recipe">Recipe</label>
                <div className={styles.recipeSearchWrap}>
                  <Icon name="search" size={16} className={styles.searchIcon} />
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
                    placeholder="Search your cookbook…"
                    className={`${styles.input} ${styles.searchInput}`}
                    autoComplete="off"
                  />
                  {showRecipeDropdown && (
                    <div className={styles.recipeDropdown}>
                      {matchingRecipes.length === 0 ? (
                        <div className={styles.recipeDropdownEmpty}>No recipes match "{recipeSearch}"</div>
                      ) : (
                        matchingRecipes.slice(0, 50).map((recipe) => (
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

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <span className={styles.groupLabel}>Meal</span>
                  <div className={styles.segmented} role="radiogroup" aria-label="Meal">
                    {['breakfast', 'lunch', 'dinner'].map((type) => (
                      <button
                        type="button"
                        key={type}
                        role="radio"
                        aria-checked={formData.meal_type === type}
                        className={`${styles.segment} ${formData.meal_type === type ? styles.segmentActive : ''}`}
                        onClick={() => setFormData({ ...formData, meal_type: type })}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="servings">Servings</label>
                  <input
                    id="servings"
                    type="number"
                    min="1"
                    value={formData.servings}
                    onChange={(e) => setFormData({ ...formData, servings: e.target.value })}
                    className={`${styles.input} ${styles.servingsInput}`}
                    required
                  />
                </div>
              </div>

              <label className={styles.recurringLabel}>
                <input
                  type="checkbox"
                  checked={formData.is_recurring}
                  onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                />
                Repeat this meal
              </label>

              {formData.is_recurring && (
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="recurrencePattern">Repeat</label>
                    <select
                      id="recurrencePattern"
                      value={formData.recurrence_pattern}
                      onChange={(e) => setFormData({ ...formData, recurrence_pattern: e.target.value })}
                      className={styles.input}
                    >
                      <option value="daily">Every day</option>
                      <option value="weekly">Every week</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Every month</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="recurrenceEnd">Until (optional)</label>
                    <input
                      id="recurrenceEnd"
                      type="date"
                      value={formData.recurrence_end_date}
                      onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                      className={styles.input}
                    />
                  </div>
                </div>
              )}

              <div className={styles.formActions}>
                <button type="button" onClick={closeModal} className="btn btn-ghost">
                  {selectedDayMeals.length > 0 ? 'Done' : 'Cancel'}
                </button>
                <button type="submit" className="btn btn-primary" disabled={!formData.recipe_id}>
                  Add to {formatDate(selectedDate, 'EEE')}
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
