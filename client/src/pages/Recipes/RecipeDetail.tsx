import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { recipesApi, pantryApi, groceryApi, cookHistoryApi } from '../../services/api';
import { Recipe } from '../../types';
import { DIETARY_TAGS } from '../../types';
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
    image_url: string;
    difficulty: string;
    dietary_tags: string[];
    personal_notes: string;
    ingredients: Array<{ name: string; quantity: string; unit: string; notes: string }>;
  }>({
    name: '', description: '', category: '', servings: '', prep_time: '',
    cook_time: '', instructions: '', calories: '', protein: '', carbs: '',
    fat: '', fiber: '', image_url: '', difficulty: '', dietary_tags: [],
    personal_notes: '', ingredients: [],
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (id) loadRecipe(parseInt(id));
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
      showNotification('error', 'Failed to delete recipe');
    }
  };

  const handleToggleFavorite = async () => {
    if (!recipe) return;
    try {
      const res = await recipesApi.toggleFavorite(recipe.id);
      setRecipe({ ...recipe, is_favorite: res.data.is_favorite });
    } catch (error) {
      showNotification('error', 'Failed to update favorite');
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
            const newQuantity = (pantryItem.quantity || 0) - ing.quantity * scaleFactor;
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

      // Log to cook history
      await cookHistoryApi.log({
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        servings_cooked: servings,
      });

      showNotification('success', 'Recipe marked as cooked! Ingredients deducted from pantry.');
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
      image_url: recipe.image_url || '',
      difficulty: recipe.difficulty || 'medium',
      dietary_tags: recipe.dietary_tags || [],
      personal_notes: recipe.personal_notes || '',
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
      const ingredients = editForm.ingredients
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
        image_url: editForm.image_url || undefined,
        difficulty: editForm.difficulty as any,
        dietary_tags: editForm.dietary_tags,
        personal_notes: editForm.personal_notes || undefined,
        ingredients: ingredients as any,
      });

      await loadRecipe(recipe.id);
      setIsEditing(false);
      showNotification('success', 'Recipe updated!');
    } catch (error) {
      showNotification('error', 'Failed to update recipe');
    }
  };

  const handleAddToGroceryList = async () => {
    if (!recipe) return;
    if (!window.confirm(`Add all ingredients from "${recipe.name}" to your grocery list for this week?`)) return;
    try {
      const weekStartDate = getWeekStartDate();
      await groceryApi.addFromRecipe({ recipe_id: recipe.id, week_start_date: weekStartDate, servings: recipe.servings });
      showNotification('success', 'Ingredients added to grocery list!');
    } catch (error) {
      showNotification('error', 'Failed to add ingredients to grocery list');
    }
  };

  const handlePrint = () => window.print();

  const toggleEditDietaryTag = (tag: string) => {
    setEditForm(prev => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter(t => t !== tag)
        : [...prev.dietary_tags, tag],
    }));
  };

  const scaleFactor = recipe && scaledServings && scaledServings !== recipe.servings
    ? (scaledServings as number) / recipe.servings
    : 1;

  if (loading) return <div className={styles.loading}>Loading recipe...</div>;
  if (!recipe) return <div className={styles.notFound}>Recipe not found</div>;

  if (isEditing) {
    return (
      <div className={styles.container}>
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.message}
          </div>
        )}
        <div className={styles.header}>
          <button onClick={() => setIsEditing(false)} className={styles.backButton}>← Cancel</button>
          <button onClick={handleSaveEdit} className={styles.saveButton}>Save Changes</button>
        </div>
        <div className={styles.content}>
          <h2 className={styles.editHeading}>Edit Recipe</h2>
          <div className={styles.editGrid}>
            <div className={styles.formGroup}>
              <label>Recipe Name *</label>
              <input type="text" value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className={styles.editInput} />
            </div>
            <div className={styles.formGroup}>
              <label>Category</label>
              <select value={editForm.category}
                onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                className={styles.editSelect}>
                <option value="">None</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Difficulty</label>
              <select value={editForm.difficulty}
                onChange={e => setEditForm({ ...editForm, difficulty: e.target.value })}
                className={styles.editSelect}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <textarea value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                className={styles.editTextarea} rows={3} />
            </div>
            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <label>Image URL</label>
              <input type="url" value={editForm.image_url}
                onChange={e => setEditForm({ ...editForm, image_url: e.target.value })}
                className={styles.editInput} placeholder="https://..." />
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
              <label>Dietary Tags</label>
              <div className={styles.editDietaryTags}>
                {DIETARY_TAGS.map(tag => (
                  <button key={tag} type="button"
                    className={`${styles.editDietaryTag} ${editForm.dietary_tags.includes(tag) ? styles.editDietaryTagActive : ''}`}
                    onClick={() => toggleEditDietaryTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <label>Instructions</label>
              <textarea value={editForm.instructions}
                onChange={e => setEditForm({ ...editForm, instructions: e.target.value })}
                className={styles.editTextarea} rows={8}
                placeholder="Enter each step on a new line" />
            </div>
            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <label>Personal Notes</label>
              <textarea value={editForm.personal_notes}
                onChange={e => setEditForm({ ...editForm, personal_notes: e.target.value })}
                className={styles.editTextarea} rows={3}
                placeholder="Your own notes, substitutions, tips..." />
            </div>
          </div>

          <div className={styles.editIngredientsSection}>
            <div className={styles.sectionHeader}>
              <h3>Ingredients</h3>
              <button type="button" className={styles.addIngredientButton}
                onClick={() => setEditForm({ ...editForm, ingredients: [...editForm.ingredients, { name: '', quantity: '', unit: '', notes: '' }] })}>
                + Add Ingredient
              </button>
            </div>
            {editForm.ingredients.map((ing, idx) => (
              <div key={idx} className={styles.ingredientRow}>
                <input type="text" value={ing.name}
                  onChange={e => { const u = [...editForm.ingredients]; u[idx] = { ...u[idx], name: e.target.value }; setEditForm({ ...editForm, ingredients: u }); }}
                  placeholder="Ingredient name" className={styles.editInput} />
                <input type="number" step="0.01" value={ing.quantity}
                  onChange={e => { const u = [...editForm.ingredients]; u[idx] = { ...u[idx], quantity: e.target.value }; setEditForm({ ...editForm, ingredients: u }); }}
                  placeholder="Qty" className={styles.editInputSmall} />
                <input type="text" value={ing.unit}
                  onChange={e => { const u = [...editForm.ingredients]; u[idx] = { ...u[idx], unit: e.target.value }; setEditForm({ ...editForm, ingredients: u }); }}
                  placeholder="Unit" className={styles.editInputSmall} />
                <input type="text" value={ing.notes}
                  onChange={e => { const u = [...editForm.ingredients]; u[idx] = { ...u[idx], notes: e.target.value }; setEditForm({ ...editForm, ingredients: u }); }}
                  placeholder="Notes (optional)" className={styles.editInput} />
                <button type="button" className={styles.removeIngredientButton}
                  onClick={() => setEditForm({ ...editForm, ingredients: editForm.ingredients.filter((_, i) => i !== idx) })}>
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
      <div className={`${styles.header} noPrint`}>
        <button onClick={() => navigate('/recipes')} className={styles.backButton}>
          ← Back to Recipes
        </button>
        <div className={styles.headerActions}>
          <button onClick={handleToggleFavorite} className={`${styles.favoriteButton} ${recipe.is_favorite ? styles.favoriteButtonActive : ''}`} title={recipe.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
            {recipe.is_favorite ? '★ Favorited' : '☆ Favorite'}
          </button>
          <button onClick={handlePrint} className={styles.printButton} title="Print recipe">
            🖨 Print
          </button>
          <button onClick={handleStartEdit} className={styles.editButton}>Edit Recipe</button>
          <button onClick={handleDelete} className={styles.deleteButton}>Delete Recipe</button>
        </div>
      </div>

      <div className={styles.content}>
        {recipe.image_url && (
          <div className={styles.recipeImageWrap}>
            <img src={recipe.image_url} alt={recipe.name} className={styles.recipeImage} />
          </div>
        )}

        <div className={styles.titleSection}>
          <h1>{recipe.name}</h1>
          <div className={styles.badgeRow}>
            {recipe.category && (
              <span className={styles.categoryBadge}>{recipe.category}</span>
            )}

          </div>
          {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
            <div className={styles.dietaryTagsRow}>
              {recipe.dietary_tags.map(tag => (
                <span key={tag} className={styles.dietaryTag}>{tag}</span>
              ))}
            </div>
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
              <span className={styles.metaLabel}>Prep:</span>
              <span className={styles.metaValue}>{recipe.prep_time} min</span>
            </div>
          )}
          {recipe.cook_time && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Cook:</span>
              <span className={styles.metaValue}>{recipe.cook_time} min</span>
            </div>
          )}
        </div>

        {(recipe.calories || recipe.protein || recipe.carbs || recipe.fat) && (
          <div className={styles.nutrition}>
            <h2>Nutrition (per serving)</h2>
            <div className={styles.nutritionGrid}>
              {recipe.calories && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.calories}</span><span className={styles.nutritionLabel}>Calories</span></div>}
              {recipe.protein && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.protein}g</span><span className={styles.nutritionLabel}>Protein</span></div>}
              {recipe.carbs && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.carbs}g</span><span className={styles.nutritionLabel}>Carbs</span></div>}
              {recipe.fat && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.fat}g</span><span className={styles.nutritionLabel}>Fat</span></div>}
            </div>
          </div>
        )}

        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Ingredients</h2>
              <div className={`${styles.sectionActions} noPrint`}>
                <div className={styles.scalingControl}>
                  <label htmlFor="scale-servings">Scale to:</label>
                  <input id="scale-servings" type="number" min="1" value={scaledServings}
                    onChange={e => setScaledServings(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className={styles.scaleInput} />
                  <span>servings</span>
                  {scaledServings !== recipe.servings && (
                    <button className={styles.resetScaleButton} onClick={() => setScaledServings(recipe.servings)}>Reset</button>
                  )}
                </div>
                <button onClick={handleAddToGroceryList} className={styles.groceryButton}>+ Add to Grocery List</button>
              </div>
            </div>
            <ul className={styles.ingredientsList}>
              {recipe.ingredients.map((ing, index) => {
                const scaledQty = ing.quantity && scaleFactor !== 1
                  ? Math.round(ing.quantity * scaleFactor * 100) / 100
                  : ing.quantity;
                return (
                  <li key={index}>
                    {scaledQty && `${scaledQty} `}{ing.unit && `${ing.unit} `}{ing.name}
                    {ing.notes && `, ${ing.notes}`}
                    {scaleFactor !== 1 && ing.quantity && <span className={styles.originalQty}> (orig: {ing.quantity})</span>}
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

        {recipe.personal_notes && (
          <div className={styles.notesSection}>
            <h2>My Notes</h2>
            <p className={styles.notesText}>{recipe.personal_notes}</p>
          </div>
        )}

        {recipe.source_url && (
          <div className={`${styles.source} noPrint`}>
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">View Original Recipe →</a>
          </div>
        )}

        <div className={`${styles.cookSection} noPrint`}>
          <h2>Mark as Cooked</h2>
          <p>Enter the number of servings you cooked to deduct ingredients from your pantry and log this to your cook history.</p>
          <div className={styles.cookForm}>
            <input type="number" step="0.1" value={servingsCooked}
              onChange={(e) => setServingsCooked(e.target.value)}
              placeholder={`Default: ${recipe.servings || 1} servings`}
              className={styles.servingsInput} />
            <button onClick={handleMarkAsCooked} className={styles.cookButton}>Mark as Cooked</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipeDetail;
