import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { recipesApi, pantryApi, groceryApi } from '../../services/api';
import { Recipe, CreateRecipeIngredient } from '../../types';
import { getWeekStartDate } from '../../utils/dateUtils';
import styles from './RecipeDetail.module.css';

const CATEGORIES = [
  'Breakfast', 'Lunch', 'Dinner', 'Appetizers & Snacks', 'Sides',
  'Salads', 'Soups & Stews', 'Sauces & Condiments', 'Desserts',
  'Beverages', 'Baking & Breads',
];

const RecipeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [servingsCooked, setServingsCooked] = useState('');
  const [scaledServings, setScaledServings] = useState<number | ''>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    category: string;
    servings: string;
    prep_time: string;
    cook_time: string;
    instructions: string;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    fiber: string;
    ingredients: Array<{ name: string; quantity: string; unit: string; notes: string }>;
  }>({
    name: '', description: '', category: '', servings: '', prep_time: '',
    cook_time: '', instructions: '', calories: '', protein: '', carbs: '',
    fat: '', fiber: '', ingredients: [],
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (id) {
      loadRecipe(parseInt(id));
    }
  }, [id]);

  const loadRecipe = async (recipeId: number) => {
    try {
      const response = await recipesApi.getOne(recipeId);
      setRecipe(response.data);
      setScaledServings(response.data.servings);
    } catch (error) {
      console.error('Error loading recipe:', error);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleDelete = async () => {
    if (!recipe || !window.confirm('Are you sure you want to delete this recipe?')) return;

    try {
      await recipesApi.delete(recipe.id);
      navigate('/recipes');
    } catch (error) {
      console.error('Error deleting recipe:', error);
      showNotification('error', 'Failed to delete recipe');
    }
  };

  const handleMarkAsCooked = async () => {
    if (!recipe || !servingsCooked) {
      showNotification('error', 'Please enter the number of servings you cooked');
      return;
    }

    const servings = parseFloat(servingsCooked);
    if (servings <= 0) {
      showNotification('error', 'Servings must be greater than 0');
      return;
    }

    try {
      const pantryResponse = await pantryApi.getAll();
      const pantryItems = pantryResponse.data;
      const scaleFactor = servings / (recipe.servings || 1);

      if (recipe.ingredients && recipe.ingredients.length > 0) {
        for (const ing of recipe.ingredients) {
          const pantryItem = pantryItems.find((p) => p.ingredient_id === ing.ingredient_id);
          if (pantryItem && ing.quantity) {
            const deductAmount = ing.quantity * scaleFactor;
            const newQuantity = (pantryItem.quantity || 0) - deductAmount;
            if (newQuantity <= 0) {
              await pantryApi.remove(pantryItem.id);
            } else {
              await pantryApi.update(pantryItem.id, {
                quantity: newQuantity,
                unit: pantryItem.unit,
                is_staple: pantryItem.is_staple,
              });
            }
          }
        }
      }

      showNotification('success', 'Recipe marked as cooked! Ingredients have been deducted from your pantry.');
      setServingsCooked('');
    } catch (error) {
      console.error('Error marking recipe as cooked:', error);
      showNotification('error', 'Failed to update pantry');
    }
  };

  const handleStartEdit = () => {
    if (!recipe) return;
    setEditForm({
      name: recipe.name,
      description: recipe.description || '',
      category: recipe.category || '',
      servings: recipe.servings?.toString() || '',
      prep_time: recipe.prep_time?.toString() || '',
      cook_time: recipe.cook_time?.toString() || '',
      instructions: recipe.instructions || '',
      calories: recipe.calories?.toString() || '',
      protein: recipe.protein?.toString() || '',
      carbs: recipe.carbs?.toString() || '',
      fat: recipe.fat?.toString() || '',
      fiber: recipe.fiber?.toString() || '',
      ingredients: (recipe.ingredients || []).map(ing => ({
        name: ing.name,
        quantity: ing.quantity?.toString() || '',
        unit: ing.unit || '',
        notes: ing.notes || '',
      })),
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!recipe) return;
    if (!editForm.name.trim()) {
      showNotification('error', 'Recipe name is required');
      return;
    }

    try {
      const ingredients: CreateRecipeIngredient[] = editForm.ingredients
        .filter(ing => ing.name.trim())
        .map(ing => ({
          name: ing.name.trim(),
          quantity: ing.quantity ? parseFloat(ing.quantity) : undefined,
          unit: ing.unit || undefined,
          notes: ing.notes || undefined,
        }));

      await recipesApi.update(recipe.id, {
        name: editForm.name.trim(),
        description: editForm.description || undefined,
        category: editForm.category || undefined,
        servings: editForm.servings ? parseInt(editForm.servings) : undefined,
        prep_time: editForm.prep_time ? parseInt(editForm.prep_time) : undefined,
        cook_time: editForm.cook_time ? parseInt(editForm.cook_time) : undefined,
        instructions: editForm.instructions || undefined,
        calories: editForm.calories ? parseFloat(editForm.calories) : undefined,
        protein: editForm.protein ? parseFloat(editForm.protein) : undefined,
        carbs: editForm.carbs ? parseFloat(editForm.carbs) : undefined,
        fat: editForm.fat ? parseFloat(editForm.fat) : undefined,
        fiber: editForm.fiber ? parseFloat(editForm.fiber) : undefined,
        ingredients,
      });

      await loadRecipe(recipe.id);
      setIsEditing(false);
      showNotification('success', 'Recipe updated!');
    } catch (error) {
      console.error('Error updating recipe:', error);
      showNotification('error', 'Failed to update recipe');
    }
  };

  const handleAddToGroceryList = async () => {
    if (!recipe) return;
    if (!window.confirm(`Add all ingredients from "${recipe.name}" to your grocery list for this week?`)) return;

    try {
      const weekStartDate = getWeekStartDate();
      await groceryApi.addFromRecipe({
        recipe_id: recipe.id,
        week_start_date: weekStartDate,
        servings: recipe.servings,
      });
      showNotification('success', 'Ingredients added to grocery list!');
    } catch (error) {
      console.error('Error adding to grocery list:', error);
      showNotification('error', 'Failed to add ingredients to grocery list');
    }
  };

  const scaleFactor = recipe && scaledServings && scaledServings !== recipe.servings
    ? (scaledServings as number) / recipe.servings
    : 1;

  if (loading) {
    return <div className={styles.loading}>Loading recipe...</div>;
  }

  if (!recipe) {
    return <div className={styles.notFound}>Recipe not found</div>;
  }

  if (isEditing) {
    return (
      <div className={styles.container}>
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.message}
          </div>
        )}
        <div className={styles.header}>
          <button onClick={() => setIsEditing(false)} className={styles.backButton}>
            ← Cancel
          </button>
          <button onClick={handleSaveEdit} className={styles.saveButton}>
            Save Changes
          </button>
        </div>

        <div className={styles.content}>
          <h2 className={styles.editHeading}>Edit Recipe</h2>

          <div className={styles.editGrid}>
            <div className={styles.formGroup}>
              <label>Recipe Name *</label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className={styles.editInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Category</label>
              <select
                value={editForm.category}
                onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                className={styles.editSelect}
              >
                <option value="">None</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <textarea
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                className={styles.editTextarea}
                rows={3}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Servings</label>
              <input type="number" min="1" value={editForm.servings}
                onChange={e => setEditForm({ ...editForm, servings: e.target.value })}
                className={styles.editInput} />
            </div>
            <div className={styles.formGroup}>
              <label>Prep Time (min)</label>
              <input type="number" min="0" value={editForm.prep_time}
                onChange={e => setEditForm({ ...editForm, prep_time: e.target.value })}
                className={styles.editInput} />
            </div>
            <div className={styles.formGroup}>
              <label>Cook Time (min)</label>
              <input type="number" min="0" value={editForm.cook_time}
                onChange={e => setEditForm({ ...editForm, cook_time: e.target.value })}
                className={styles.editInput} />
            </div>

            <div className={styles.formGroup}>
              <label>Calories (per serving)</label>
              <input type="number" min="0" value={editForm.calories}
                onChange={e => setEditForm({ ...editForm, calories: e.target.value })}
                className={styles.editInput} />
            </div>
            <div className={styles.formGroup}>
              <label>Protein (g)</label>
              <input type="number" min="0" step="0.1" value={editForm.protein}
                onChange={e => setEditForm({ ...editForm, protein: e.target.value })}
                className={styles.editInput} />
            </div>
            <div className={styles.formGroup}>
              <label>Carbs (g)</label>
              <input type="number" min="0" step="0.1" value={editForm.carbs}
                onChange={e => setEditForm({ ...editForm, carbs: e.target.value })}
                className={styles.editInput} />
            </div>
            <div className={styles.formGroup}>
              <label>Fat (g)</label>
              <input type="number" min="0" step="0.1" value={editForm.fat}
                onChange={e => setEditForm({ ...editForm, fat: e.target.value })}
                className={styles.editInput} />
            </div>
            <div className={styles.formGroup}>
              <label>Fiber (g)</label>
              <input type="number" min="0" step="0.1" value={editForm.fiber}
                onChange={e => setEditForm({ ...editForm, fiber: e.target.value })}
                className={styles.editInput} />
            </div>

            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <label>Instructions</label>
              <textarea
                value={editForm.instructions}
                onChange={e => setEditForm({ ...editForm, instructions: e.target.value })}
                className={styles.editTextarea}
                rows={8}
                placeholder="Enter each step on a new line"
              />
            </div>
          </div>

          <div className={styles.editIngredientsSection}>
            <div className={styles.sectionHeader}>
              <h3>Ingredients</h3>
              <button
                type="button"
                className={styles.addIngredientButton}
                onClick={() => setEditForm({
                  ...editForm,
                  ingredients: [...editForm.ingredients, { name: '', quantity: '', unit: '', notes: '' }],
                })}
              >
                + Add Ingredient
              </button>
            </div>
            {editForm.ingredients.map((ing, idx) => (
              <div key={idx} className={styles.ingredientRow}>
                <input
                  type="text"
                  value={ing.name}
                  onChange={e => {
                    const updated = [...editForm.ingredients];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setEditForm({ ...editForm, ingredients: updated });
                  }}
                  placeholder="Ingredient name"
                  className={styles.editInput}
                />
                <input
                  type="number"
                  step="0.01"
                  value={ing.quantity}
                  onChange={e => {
                    const updated = [...editForm.ingredients];
                    updated[idx] = { ...updated[idx], quantity: e.target.value };
                    setEditForm({ ...editForm, ingredients: updated });
                  }}
                  placeholder="Qty"
                  className={styles.editInputSmall}
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={e => {
                    const updated = [...editForm.ingredients];
                    updated[idx] = { ...updated[idx], unit: e.target.value };
                    setEditForm({ ...editForm, ingredients: updated });
                  }}
                  placeholder="Unit"
                  className={styles.editInputSmall}
                />
                <input
                  type="text"
                  value={ing.notes}
                  onChange={e => {
                    const updated = [...editForm.ingredients];
                    updated[idx] = { ...updated[idx], notes: e.target.value };
                    setEditForm({ ...editForm, ingredients: updated });
                  }}
                  placeholder="Notes (optional)"
                  className={styles.editInput}
                />
                <button
                  type="button"
                  className={styles.removeIngredientButton}
                  onClick={() => setEditForm({
                    ...editForm,
                    ingredients: editForm.ingredients.filter((_, i) => i !== idx),
                  })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
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
        <button onClick={() => navigate('/recipes')} className={styles.backButton}>
          ← Back to Recipes
        </button>
        <div className={styles.headerActions}>
          <button onClick={handleStartEdit} className={styles.editButton}>
            Edit Recipe
          </button>
          <button onClick={handleDelete} className={styles.deleteButton}>
            Delete Recipe
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.titleSection}>
          <h1>{recipe.name}</h1>
          {recipe.category && (
            <span className={styles.categoryBadge}>{recipe.category}</span>
          )}
        </div>

        {recipe.description && <p className={styles.description}>{recipe.description}</p>}

        <div className={styles.metadata}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Servings:</span>
            <span className={styles.metaValue}>{recipe.servings}</span>
          </div>
          {recipe.prep_time && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Prep Time:</span>
              <span className={styles.metaValue}>{recipe.prep_time} min</span>
            </div>
          )}
          {recipe.cook_time && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Cook Time:</span>
              <span className={styles.metaValue}>{recipe.cook_time} min</span>
            </div>
          )}
        </div>

        {(recipe.calories || recipe.protein || recipe.carbs || recipe.fat) && (
          <div className={styles.nutrition}>
            <h2>Nutrition (per serving)</h2>
            <div className={styles.nutritionGrid}>
              {recipe.calories && (
                <div className={styles.nutritionItem}>
                  <span className={styles.nutritionValue}>{recipe.calories}</span>
                  <span className={styles.nutritionLabel}>Calories</span>
                </div>
              )}
              {recipe.protein && (
                <div className={styles.nutritionItem}>
                  <span className={styles.nutritionValue}>{recipe.protein}g</span>
                  <span className={styles.nutritionLabel}>Protein</span>
                </div>
              )}
              {recipe.carbs && (
                <div className={styles.nutritionItem}>
                  <span className={styles.nutritionValue}>{recipe.carbs}g</span>
                  <span className={styles.nutritionLabel}>Carbs</span>
                </div>
              )}
              {recipe.fat && (
                <div className={styles.nutritionItem}>
                  <span className={styles.nutritionValue}>{recipe.fat}g</span>
                  <span className={styles.nutritionLabel}>Fat</span>
                </div>
              )}
            </div>
          </div>
        )}

        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Ingredients</h2>
              <div className={styles.sectionActions}>
                <div className={styles.scalingControl}>
                  <label htmlFor="scale-servings">Scale to:</label>
                  <input
                    id="scale-servings"
                    type="number"
                    min="1"
                    value={scaledServings}
                    onChange={e => setScaledServings(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className={styles.scaleInput}
                  />
                  <span>servings</span>
                  {scaledServings !== recipe.servings && (
                    <button
                      className={styles.resetScaleButton}
                      onClick={() => setScaledServings(recipe.servings)}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <button onClick={handleAddToGroceryList} className={styles.groceryButton}>
                  + Add to Grocery List
                </button>
              </div>
            </div>
            <ul className={styles.ingredientsList}>
              {recipe.ingredients.map((ing, index) => {
                const scaledQty = ing.quantity && scaleFactor !== 1
                  ? Math.round(ing.quantity * scaleFactor * 100) / 100
                  : ing.quantity;
                return (
                  <li key={index}>
                    {scaledQty && `${scaledQty} `}
                    {ing.unit && `${ing.unit} `}
                    {ing.name}
                    {ing.notes && `, ${ing.notes}`}
                    {scaleFactor !== 1 && ing.quantity && (
                      <span className={styles.originalQty}> (orig: {ing.quantity})</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {recipe.instructions && (
          <div className={styles.section}>
            <h2>Instructions</h2>
            <ol className={styles.instructionsList}>
              {recipe.instructions.split('\n').filter(step => step.trim()).map((step, index) => (
                <li key={index}>{step.trim()}</li>
              ))}
            </ol>
          </div>
        )}

        {recipe.source_url && (
          <div className={styles.source}>
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
              View Original Recipe →
            </a>
          </div>
        )}

        <div className={styles.cookSection}>
          <h2>Mark as Cooked</h2>
          <p>Enter the number of servings you cooked to automatically deduct ingredients from your pantry.</p>
          <div className={styles.cookForm}>
            <input
              type="number"
              step="0.1"
              value={servingsCooked}
              onChange={(e) => setServingsCooked(e.target.value)}
              placeholder={`Default: ${recipe.servings || 1} servings`}
              className={styles.servingsInput}
            />
            <button onClick={handleMarkAsCooked} className={styles.cookButton}>
              Mark as Cooked
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipeDetail;
