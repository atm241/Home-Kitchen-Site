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
  GroceryPrice,
  MealPortion,
  CookHistoryEntry,
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';
const TOKEN_STORAGE_KEY = 'home_kitchen_token';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const getToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_STORAGE_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_STORAGE_KEY);

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

export interface Household {
  id: number;
  name: string;
  inviteCode: string;
}

export const authApi = {
  signup: (data: { email: string; password: string; name: string; householdName?: string; inviteCode?: string }) =>
    api.post<{ token: string; user: AuthUser }>('/auth/signup', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ token: string; user: AuthUser }>('/auth/login', data),
  me: () => api.get<{ user: AuthUser; household: Household }>('/auth/me'),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post<{ success: boolean }>('/auth/change-password', data),
  regenerateInviteCode: () => api.post<{ inviteCode: string }>('/auth/household/invite-code'),
};

// Recipes
export const recipesApi = {
  getAll: () => api.get<Recipe[]>('/recipes'),
  getOne: (id: number) => api.get<Recipe>(`/recipes/${id}`),
  create: (recipe: CreateRecipeInput) => api.post<Recipe>('/recipes', recipe),
  update: (id: number, recipe: Partial<Recipe>) => api.put<Recipe>(`/recipes/${id}`, recipe),
  delete: (id: number) => api.delete(`/recipes/${id}`),
  toggleFavorite: (id: number) => api.patch<{ is_favorite: boolean }>(`/recipes/${id}/favorite`),
  importFromUrl: (url: string) => api.post<Recipe>('/recipes/import', { url }),
  importBulk: (urls: string[]) => api.post<BulkImportResult>('/recipes/import-bulk', { urls }),
  importFromSpoonacular: (id: number) => api.post<Recipe>(`/recipes/import-spoonacular/${id}`),
  filterByNutrition: (params: { maxCarbs?: number; minProtein?: number; dietaryTag?: string }) =>
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

export interface UseItUpExpiringItem {
  id: number;
  quantity: number;
  unit: string;
  expiration_date: string;
  ingredient_name: string;
  category: string;
  days_until_expiry: number;
}

export interface UseItUpRecipe {
  id: number;
  name: string;
  image_url?: string;
  category?: string;
  servings?: number;
  calories?: number;
  prep_time?: number;
  cook_time?: number;
  difficulty?: string;
  dietary_tags?: string[];
  is_favorite?: boolean;
  expiring_ingredient_count: number;
  expiring_ingredients: { name: string; expiration_date: string; days_until_expiry: number }[];
}

export interface UseItUpResult {
  expiringItems: UseItUpExpiringItem[];
  recipes: UseItUpRecipe[];
}

export interface ParsedReceiptItem {
  ingredient_id: number;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiration_date: string | null;
}

export interface BarcodeProduct {
  barcode: string;
  name: string;
  category: string;
  imageUrl: string | null;
}

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
  parseReceipt: (data: { image: string; mediaType: string }) =>
    api.post<ParsedReceiptItem[]>('/pantry/parse-receipt', data),
  useItUp: (days = 5) =>
    api.get<UseItUpResult>('/pantry/use-it-up', { params: { days } }),
  lookupBarcode: (code: string) => api.get<BarcodeProduct>(`/pantry/barcode/${code}`),
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
  getList: (weekStartDate: string) =>
    api.get<GroceryItem[]>('/grocery', { params: { week_start_date: weekStartDate } }),
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
  clearList: (weekStartDate: string) =>
    api.delete('/grocery/clear', { params: { week_start_date: weekStartDate } }),
  addPurchasedToPantry: (weekStartDate: string) =>
    api.post('/grocery/add-to-pantry', { week_start_date: weekStartDate }),
  getPrices: (storeName?: string) =>
    api.get<GroceryPrice[]>('/grocery/prices', { params: storeName ? { store_name: storeName } : {} }),
  addPrice: (price: Partial<GroceryPrice>) => api.post<GroceryPrice>('/grocery/prices', price),
};

export interface MonthlyBudget {
  month: string;
  budget_amount: number;
  calorie_budget?: number | null;
  protein_goal?: number | null;
  carbs_goal?: number | null;
  fat_goal?: number | null;
  estimated_cost: number;
  actual_cost: number;
}

// Budget
export interface BudgetHistoryMonth {
  month: string;
  estimated_cost: number;
  actual_cost: number;
  budget_amount: number;
}

export const budgetApi = {
  updateActual: (weekStartDate: string, actualCost: number) =>
    api.patch(`/budget/${weekStartDate}/actual`, { actual_cost: actualCost }),
  getHistory: (months = 6) =>
    api.get<BudgetHistoryMonth[]>('/budget/history', { params: { months } }),
  getMonthly: (month: string) => api.get<MonthlyBudget>('/budget/monthly', { params: { month } }),
  createOrUpdateMonthly: (data: {
    month: string;
    budget_amount: number;
    calorie_budget?: number;
    protein_goal?: number;
    carbs_goal?: number;
    fat_goal?: number;
  }) => api.post<MonthlyBudget>('/budget/monthly', data),
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
  // 'saved' = one of the household's own recipes ranked against the pantry;
  // undefined/'spoonacular' = a Spoonacular API result.
  source?: 'spoonacular' | 'saved';
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  failed: number;
  results: Array<{
    url: string;
    status: 'imported' | 'skipped' | 'failed';
    recipeId?: number;
    error?: string;
  }>;
}

export interface IngredientCombo {
  id: string;
  ingredients: Array<{ name: string; image?: string }>;
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
  get: (forceRefresh = false) =>
    api.get<RecipeRecommendation[]>('/recommendations', forceRefresh ? { params: { refresh: true } } : undefined),
  getIngredientCombos: (forceRefresh = false) =>
    api.get<IngredientCombo[]>('/recommendations/ingredient-combos', forceRefresh ? { params: { refresh: true } } : undefined),
};

// Cook History
export const cookHistoryApi = {
  getAll: (limit?: number) =>
    api.get<CookHistoryEntry[]>('/cook-history', limit ? { params: { limit } } : undefined),
  log: (entry: { recipe_id?: number; recipe_name: string; servings_cooked?: number }) =>
    api.post<CookHistoryEntry>('/cook-history', entry),
  delete: (id: number) => api.delete(`/cook-history/${id}`),
};

export default api;
