export interface Ingredient {
  id: number;
  name: string;
  category?: string;
  created_at?: string;
}

export interface RecipeIngredient {
  ingredient_id: number;
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export interface CreateRecipeIngredient {
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  ingredient_id?: number;
  category?: string;
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export const DIETARY_TAGS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Nut-Free', 'Low-Carb', 'Paleo', 'Keto'] as const;
export type DietaryTag = typeof DIETARY_TAGS[number];

export interface Recipe {
  id: number;
  name: string;
  description?: string;
  source_url?: string;
  category?: string;
  servings: number;
  prep_time?: number;
  cook_time?: number;
  instructions?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  image_url?: string;
  is_favorite?: boolean;
  dietary_tags?: string[];
  difficulty?: DifficultyLevel;
  personal_notes?: string;
  ingredients?: RecipeIngredient[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateRecipeInput {
  name: string;
  description?: string;
  source_url?: string;
  category?: string;
  servings?: number;
  prep_time?: number;
  cook_time?: number;
  instructions?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  image_url?: string;
  dietary_tags?: string[];
  difficulty?: DifficultyLevel;
  personal_notes?: string;
  ingredients?: CreateRecipeIngredient[];
}

export interface PantryItem {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  expiration_date?: string;
  is_staple: boolean;
  last_updated?: string;
}

export interface ScheduledMeal {
  id: number;
  recipe_id: number;
  recipe_name: string;
  recipe_description?: string;
  meal_date: string;
  meal_type?: string;
  servings: number;
  is_recurring: boolean;
  recurrence_pattern?: string;
  recurrence_end_date?: string;
  notes?: string;
  created_at?: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  event_date: string;
  event_type?: string;
  meal_type?: string;
  notes?: string;
  created_at?: string;
}

export interface CombinedCalendarItem {
  type: 'meal' | 'event';
  id: number;
  date: string;
  meal_type?: string;
  title: string;
  servings?: number;
  notes?: string;
  recipe_id?: number;
  calories?: number;
}

export interface GroceryItem {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  estimated_price?: number;
  store_price?: number;
  is_purchased: boolean;
  week_start_date: string;
  created_at?: string;
}

export interface Budget {
  id?: number;
  week_start_date: string;
  budget_amount: number;
  estimated_cost: number;
  actual_cost: number;
  calorie_budget?: number;
  created_at?: string;
}

export interface GroceryPrice {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  store_name: string;
  price: number;
  quantity?: number;
  unit?: string;
  last_updated?: string;
}

export interface MealPortion {
  id: number;
  scheduled_meal_id: number;
  servings_made: number;
  servings_consumed: number;
  date_made: string;
  notes?: string;
  created_at?: string;
}

export interface CookHistoryEntry {
  id: number;
  recipe_id?: number;
  recipe_name: string;
  servings_cooked?: number;
  cooked_at: string;
  image_url?: string;
  category?: string;
  calories?: number;
}
