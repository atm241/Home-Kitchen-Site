import axios from 'axios';
import type {
  Recipe,
  CreateRecipeInput,
  Ingredient,
  PantryItem,
  ScheduledMeal,
  CalendarEvent,
  CombinedCalendarItem,
  GroceryItem,
  Budget,
  GroceryPrice,
  MealPortion,
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Recipes
export const recipesApi = {
  getAll: () => api.get<Recipe[]>('/recipes'),
  getOne: (id: number) => api.get<Recipe>(`/recipes/${id}`),
  create: (recipe: CreateRecipeInput) => api.post<Recipe>('/recipes', recipe),
  update: (id: number, recipe: Partial<Recipe>) => api.put<Recipe>(`/recipes/${id}`, recipe),
  delete: (id: number) => api.delete(`/recipes/${id}`),
  importFromUrl: (url: string) => api.post<Recipe>('/recipes/import', { url }),
  filterByNutrition: (params: { maxCarbs?: number; minProtein?: number; minVegetables?: number }) =>
    api.get<Recipe[]>('/recipes/filter/nutritional', { params }),
};

// Ingredients
export const ingredientsApi = {
  getAll: () => api.get<Ingredient[]>('/ingredients'),
  getOne: (id: number) => api.get<Ingredient>(`/ingredients/${id}`),
  create: (ingredient: Partial<Ingredient>) => api.post<Ingredient>('/ingredients', ingredient),
  update: (id: number, ingredient: Partial<Ingredient>) =>
    api.put<Ingredient>(`/ingredients/${id}`, ingredient),
  delete: (id: number) => api.delete(`/ingredients/${id}`),
};

// Pantry
export const pantryApi = {
  getAll: () => api.get<PantryItem[]>('/pantry'),
  getStaples: () => api.get<PantryItem[]>('/pantry/staples'),
  add: (item: Partial<PantryItem>) => api.post<PantryItem>('/pantry', item),
  update: (id: number, item: Partial<PantryItem>) => api.put<PantryItem>(`/pantry/${id}`, item),
  remove: (id: number) => api.delete(`/pantry/${id}`),
  addServings: (data: { scheduled_meal_id: number; servings_made: number; date_made: string }) =>
    api.post('/pantry/add-servings', data),
  consumeServings: (data: { meal_portion_id: number; servings_consumed: number }) =>
    api.post('/pantry/consume-servings', data),
};

// Scheduled Meals
export const mealsApi = {
  getAll: (params?: { start_date?: string; end_date?: string }) =>
    api.get<ScheduledMeal[]>('/meals', { params }),
  getOne: (id: number) => api.get<ScheduledMeal>(`/meals/${id}`),
  create: (meal: Partial<ScheduledMeal>) => api.post<ScheduledMeal>('/meals', meal),
  update: (id: number, meal: Partial<ScheduledMeal>) =>
    api.put<ScheduledMeal>(`/meals/${id}`, meal),
  delete: (id: number) => api.delete(`/meals/${id}`),
  getPortions: (scheduledMealId: number) =>
    api.get<MealPortion[]>(`/meals/portions/${scheduledMealId}`),
};

// Calendar
export const calendarApi = {
  getEvents: (params?: { start_date?: string; end_date?: string }) =>
    api.get<CalendarEvent[]>('/calendar', { params }),
  getCombined: (params?: { start_date?: string; end_date?: string }) =>
    api.get<CombinedCalendarItem[]>('/calendar/combined', { params }),
  createEvent: (event: Partial<CalendarEvent>) => api.post<CalendarEvent>('/calendar', event),
  updateEvent: (id: number, event: Partial<CalendarEvent>) =>
    api.put<CalendarEvent>(`/calendar/${id}`, event),
  deleteEvent: (id: number) => api.delete(`/calendar/${id}`),
};

// Grocery List
export const groceryApi = {
  getList: (weekStartDate: string) => api.get<GroceryItem[]>('/grocery', { params: { week_start_date: weekStartDate } }),
  generate: (data: { week_start_date: string; week_end_date: string }) =>
    api.post<GroceryItem[]>('/grocery/generate', data),
  addManual: (data: { ingredient_name: string; quantity?: number; unit?: string; week_start_date: string }) =>
    api.post<GroceryItem>('/grocery', data),
  addFromRecipe: (data: { recipe_id: number; week_start_date: string; servings?: number }) =>
    api.post<GroceryItem[]>('/grocery/from-recipe', data),
  markPurchased: (id: number, isPurchased: boolean) =>
    api.patch<GroceryItem>(`/grocery/${id}/purchase`, { is_purchased: isPurchased }),
  update: (id: number, item: Partial<GroceryItem>) => api.put<GroceryItem>(`/grocery/${id}`, item),
  delete: (id: number) => api.delete(`/grocery/${id}`),
  clearList: (weekStartDate: string) => api.delete('/grocery/clear', { params: { week_start_date: weekStartDate } }),
  addPurchasedToPantry: (weekStartDate: string) => api.post('/grocery/add-to-pantry', { week_start_date: weekStartDate }),
  getPrices: (storeName?: string) =>
    api.get<GroceryPrice[]>('/grocery/prices', { params: storeName ? { store_name: storeName } : {} }),
  addPrice: (price: Partial<GroceryPrice>) => api.post<GroceryPrice>('/grocery/prices', price),
};

// Budget
export const budgetApi = {
  get: (weekStartDate: string) => api.get<Budget>('/budget', { params: { week_start_date: weekStartDate } }),
  getAll: () => api.get<Budget[]>('/budget/all'),
  createOrUpdate: (budget: Partial<Budget>) => api.post<Budget>('/budget', budget),
  updateActual: (weekStartDate: string, actualCost: number) =>
    api.patch<Budget>(`/budget/${weekStartDate}/actual`, { actual_cost: actualCost }),
  recalculate: (weekStartDate: string) => api.post<Budget>(`/budget/${weekStartDate}/recalculate`),
};

// Recommendations
export interface RecipeRecommendation {
  id: number;
  name: string;
  description: string;
  image: string;
  sourceUrl: string;
  rating: number;
  prepTime: number;
  servings: number;
  matchPercentage: number;
  missingIngredients: string[];
  availableIngredients: string[];
  calories?: number;
}

export interface IngredientCombo {
  id: string;
  ingredients: Array<{
    name: string;
    image?: string;
  }>;
  unlockedRecipes: Array<{
    id: number;
    title: string;
    image: string;
    usedIngredientCount: number;
    missedIngredientCount: number;
  }>;
  recipeCount: number;
  impact: number;
}

export const recommendationsApi = {
  get: () => api.get<RecipeRecommendation[]>('/recommendations'),
  getIngredientCombos: () => api.get<IngredientCombo[]>('/recommendations/ingredient-combos'),
};

export default api;
