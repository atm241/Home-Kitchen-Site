import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { recipesApi, pantryApi, groceryApi } from '../../services/api';
import { Recipe } from '../../types';
import { getWeekStartDate } from '../../utils/dateUtils';
import styles from './RecipeDetail.module.css';

const RecipeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [servingsCooked, setServingsCooked] = useState('');
  const [editingCategory, setEditingCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
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
      // Get current pantry
      const pantryResponse = await pantryApi.getAll();
      const pantryItems = pantryResponse.data;

      // Calculate the scaling factor based on servings
      const scaleFactor = servings / (recipe.servings || 1);

      // For each ingredient in the recipe, deduct from pantry
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        for (const ing of recipe.ingredients) {
          // Find the ingredient in pantry
          const pantryItem = pantryItems.find(
            (p) => p.ingredient_id === ing.ingredient_id
          );

          if (pantryItem && ing.quantity) {
            // Calculate how much to deduct
            const deductAmount = ing.quantity * scaleFactor;
            const newQuantity = (pantryItem.quantity || 0) - deductAmount;

            // Update pantry (or remove if quantity drops to 0 or below)
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

  const handleEditCategory = () => {
    setSelectedCategory(recipe?.category || '');
    setEditingCategory(true);
  };

  const handleUpdateCategory = async () => {
    if (!recipe) return;

    try {
      await recipesApi.update(recipe.id, {
        category: selectedCategory || undefined,
      });

      // Reload the recipe to get updated data
      await loadRecipe(recipe.id);
      setEditingCategory(false);
    } catch (error) {
      console.error('Error updating category:', error);
      showNotification('error', 'Failed to update category');
    }
  };

  const handleCancelEdit = () => {
    setEditingCategory(false);
    setSelectedCategory('');
  };

  const handleAddToGroceryList = async () => {
    if (!recipe) return;

    const confirmAdd = window.confirm(
      `Add all ingredients from "${recipe.name}" to your grocery list for this week?`
    );

    if (!confirmAdd) return;

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

  if (loading) {
    return <div className={styles.loading}>Loading recipe...</div>;
  }

  if (!recipe) {
    return <div className={styles.notFound}>Recipe not found</div>;
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
        <button onClick={handleDelete} className={styles.deleteButton}>
          Delete Recipe
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.titleSection}>
          <h1>{recipe.name}</h1>
          {recipe.category && (
            <div className={styles.categoryDisplay}>
              <span className={styles.categoryBadge}>{recipe.category}</span>
              <button onClick={handleEditCategory} className={styles.editCategoryButton}>
                Edit Category
              </button>
            </div>
          )}
          {!recipe.category && (
            <button onClick={handleEditCategory} className={styles.addCategoryButton}>
              + Add Category
            </button>
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
              <button onClick={handleAddToGroceryList} className={styles.groceryButton}>
                + Add to Grocery List
              </button>
            </div>
            <ul className={styles.ingredientsList}>
              {recipe.ingredients.map((ing, index) => (
                <li key={index}>
                  {ing.quantity && `${ing.quantity} `}
                  {ing.unit && `${ing.unit} `}
                  {ing.name}
                  {ing.notes && `, ${ing.notes}`}
                </li>
              ))}
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

      {editingCategory && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Edit Recipe Category</h2>
            <div className={styles.formGroup}>
              <label htmlFor="category-select">Category:</label>
              <select
                id="category-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={styles.select}
              >
                <option value="">None</option>
                <option value="Breakfast">Breakfast</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
                <option value="Appetizers & Snacks">Appetizers & Snacks</option>
                <option value="Sides">Sides</option>
                <option value="Salads">Salads</option>
                <option value="Soups & Stews">Soups & Stews</option>
                <option value="Sauces & Condiments">Sauces & Condiments</option>
                <option value="Desserts">Desserts</option>
                <option value="Beverages">Beverages</option>
                <option value="Baking & Breads">Baking & Breads</option>
              </select>
            </div>
            <div className={styles.modalActions}>
              <button onClick={handleCancelEdit} className={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={handleUpdateCategory} className={styles.saveButton}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeDetail;
