import React, { useState, useEffect } from 'react';
import { pantryApi, ingredientsApi, groceryApi, recommendationsApi, RecipeRecommendation } from '../../services/api';
import { PantryItem, Ingredient } from '../../types';
import { getWeekStartDate } from '../../utils/dateUtils';
import styles from './Pantry.module.css';

const Pantry: React.FC = () => {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [recommendations, setRecommendations] = useState<RecipeRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [newItem, setNewItem] = useState({
    ingredient_name: '',
    quantity: '',
    unit: 'cup',
    category: 'Other',
    is_staple: false,
  });

  useEffect(() => {
    loadPantry();
    loadIngredients();
    loadRecommendations(false); // Only load cached recommendations
  }, []);

  const loadRecommendations = async (forceRefresh = false) => {
    try {
      setLoadingRecommendations(true);
      const url = forceRefresh ? '/recommendations?refresh=true' : '/recommendations';
      const response = await fetch(`http://localhost:5001/api${url}`);
      const data = await response.json();
      setRecommendations(data);
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleRefreshRecommendations = async () => {
    await loadRecommendations(true);
    alert('Recommendations refreshed!');
  };

  const handleAddRecipe = async (recipeId: number) => {
    try {
      const response = await fetch(`http://localhost:5001/api/recipes/import-spoonacular/${recipeId}`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('Recipe added successfully!');
      } else {
        throw new Error('Failed to import recipe');
      }
    } catch (error) {
      console.error('Error adding recipe:', error);
      alert('Failed to add recipe');
    }
  };

  const loadPantry = async () => {
    try {
      const response = await pantryApi.getAll();
      setPantryItems(response.data);
    } catch (error) {
      console.error('Error loading pantry:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadIngredients = async () => {
    try {
      const response = await ingredientsApi.getAll();
      setIngredients(response.data);
    } catch (error) {
      console.error('Error loading ingredients:', error);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // First, find or create the ingredient
      let ingredient = ingredients.find(
        (ing) => ing.name.toLowerCase() === newItem.ingredient_name.toLowerCase()
      );

      if (!ingredient) {
        // Create new ingredient
        const response = await ingredientsApi.create({
          name: newItem.ingredient_name,
          category: newItem.category,
        });
        ingredient = response.data;
        await loadIngredients(); // Reload ingredients list
      }

      // Add to pantry
      await pantryApi.add({
        ingredient_id: ingredient.id,
        quantity: parseFloat(newItem.quantity),
        unit: newItem.unit,
        is_staple: newItem.is_staple,
      });

      // Reset form and reload pantry
      setNewItem({
        ingredient_name: '',
        quantity: '',
        unit: 'cup',
        category: 'Other',
        is_staple: false,
      });
      setShowAddForm(false);
      loadPantry();
    } catch (error) {
      console.error('Error adding pantry item:', error);
      alert('Failed to add item to pantry');
    }
  };

  const handleRemoveItem = async (id: number) => {
    if (!window.confirm('Remove this item from your pantry?')) return;

    try {
      await pantryApi.remove(id);
      loadPantry();
    } catch (error) {
      console.error('Error removing item:', error);
      alert('Failed to remove item');
    }
  };

  const handleEditItem = (item: PantryItem) => {
    setEditingItem(item);
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;

    try {
      // Update the ingredient's category if it changed
      const ingredient = ingredients.find(
        (ing) => ing.id === editingItem.ingredient_id
      );

      if (ingredient && editingItem.category !== ingredient.category) {
        await ingredientsApi.update(ingredient.id, {
          name: ingredient.name,
          category: editingItem.category,
        });
        await loadIngredients(); // Reload ingredients list
      }

      await pantryApi.update(editingItem.id, {
        quantity: editingItem.quantity,
        unit: editingItem.unit,
        is_staple: editingItem.is_staple,
      });
      setEditingItem(null);
      loadPantry();
    } catch (error) {
      console.error('Error updating pantry item:', error);
      alert('Failed to update item');
    }
  };

  const handleAddLowStockToGrocery = async (item: PantryItem) => {
    const confirmAdd = window.confirm(
      `Add ${item.ingredient_name} to your grocery list for this week?`
    );

    if (!confirmAdd) return;

    try {
      const weekStartDate = getWeekStartDate();
      await groceryApi.addManual({
        ingredient_name: item.ingredient_name,
        quantity: 5, // Default to 5 units
        unit: item.unit || 'unit',
        week_start_date: weekStartDate,
      });

      alert(`${item.ingredient_name} added to grocery list!`);
    } catch (error) {
      console.error('Error adding to grocery list:', error);
      alert('Failed to add to grocery list');
    }
  };

  const groupedItems = pantryItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, PantryItem[]>);

  if (loading) {
    return <div className={styles.loading}>Loading pantry...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Pantry</h1>
        <button onClick={() => setShowAddForm(!showAddForm)} className={styles.addButton}>
          {showAddForm ? 'Cancel' : 'Add Item'}
        </button>
      </div>

      {/* Recommended Recipes Section */}
      {pantryItems.length > 0 && (
        <div className={styles.recommendationsSection}>
          <div className={styles.recommendationsHeader}>
            <div className={styles.headerContent}>
              <h2>Recommended Recipes</h2>
              <p>Top-rated recipes you can make with your pantry items</p>
            </div>
            <button
              onClick={handleRefreshRecommendations}
              className={styles.refreshButton}
              disabled={loadingRecommendations}
              title="Get fresh recommendations"
            >
              🔄
            </button>
          </div>
          {loadingRecommendations ? (
            <div className={styles.loadingRecommendations}>Loading recommendations...</div>
          ) : recommendations.length === 0 ? (
            <div className={styles.noRecommendations}>
              No recipe recommendations found. Add more ingredients to your pantry!
            </div>
          ) : (
            <div className={styles.recommendationsGrid}>
              {recommendations.map((recipe) => (
                <div key={recipe.id} className={styles.recipeCard}>
                  {recipe.image && (
                    <img src={recipe.image} alt={recipe.name} className={styles.recipeImage} />
                  )}
                  <div className={styles.recipeContent}>
                    <h3 className={styles.recipeName}>{recipe.name}</h3>
                    <div className={styles.recipeMetadata}>
                      <span className={styles.recipeRating}>⭐ {recipe.rating.toFixed(1)}</span>
                      <span className={styles.recipeTime}>🕐 {recipe.prepTime} min</span>
                      <span className={styles.recipeServings}>🍽️ {recipe.servings} servings</span>
                      {recipe.calories && (
                        <span className={styles.recipeCalories}>🔥 {recipe.calories} cal</span>
                      )}
                    </div>
                    <div className={styles.matchPercentage}>
                      <div className={styles.matchBar}>
                        <div
                          className={styles.matchBarFill}
                          style={{ width: `${recipe.matchPercentage}%` }}
                        />
                      </div>
                      <span className={styles.matchText}>{recipe.matchPercentage}% match</span>
                    </div>
                    {recipe.missingIngredients.length > 0 && (
                      <div className={styles.missingIngredients}>
                        <strong>Need:</strong> {recipe.missingIngredients.join(', ')}
                      </div>
                    )}
                    <div className={styles.recipeActions}>
                      {recipe.sourceUrl && (
                        <a
                          href={recipe.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.viewRecipeButton}
                        >
                          View Recipe
                        </a>
                      )}
                      <button
                        onClick={() => handleAddRecipe(recipe.id)}
                        className={styles.addRecipeButton}
                        title="Add to my recipes"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className={styles.addFormCard}>
          <h2>Add Pantry Item</h2>
          <form onSubmit={handleAddItem} className={styles.addForm}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="ingredient_name">Ingredient Name</label>
                <input
                  type="text"
                  id="ingredient_name"
                  value={newItem.ingredient_name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, ingredient_name: e.target.value })
                  }
                  placeholder="e.g., Olive Oil, Rice, Tomatoes"
                  className={styles.input}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="category">Category</label>
                <select
                  id="category"
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className={styles.select}
                >
                  <option value="Produce">Produce</option>
                  <option value="Proteins">Proteins</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Grains & Pasta">Grains & Pasta</option>
                  <option value="Canned Goods">Canned Goods</option>
                  <option value="Baking">Baking</option>
                  <option value="Spices & Seasonings">Spices & Seasonings</option>
                  <option value="Condiments & Sauces">Condiments & Sauces</option>
                  <option value="Oils & Vinegars">Oils & Vinegars</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Snacks">Snacks</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="quantity">Quantity</label>
                <input
                  type="number"
                  id="quantity"
                  step="0.1"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  placeholder="1.5"
                  className={styles.input}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="unit">Unit</label>
                <select
                  id="unit"
                  value={newItem.unit}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                  className={styles.select}
                >
                  <option value="cup">Cup</option>
                  <option value="tbsp">Tablespoon</option>
                  <option value="tsp">Teaspoon</option>
                  <option value="oz">Ounce</option>
                  <option value="lb">Pound</option>
                  <option value="g">Gram</option>
                  <option value="kg">Kilogram</option>
                  <option value="ml">Milliliter</option>
                  <option value="l">Liter</option>
                  <option value="count">Count</option>
                  <option value="can">Can</option>
                  <option value="jar">Jar</option>
                  <option value="bottle">Bottle</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={newItem.is_staple}
                  onChange={(e) =>
                    setNewItem({ ...newItem, is_staple: e.target.checked })
                  }
                  className={styles.checkbox}
                />
                <span>Mark as staple (always keep in stock)</span>
              </label>
            </div>
            <button type="submit" className={styles.submitButton}>
              Add to Pantry
            </button>
          </form>
        </div>
      )}

      {editingItem && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Edit Pantry Item</h2>
            <div className={styles.editForm}>
              <div className={styles.formGroup}>
                <label>Ingredient Name</label>
                <input
                  type="text"
                  value={editingItem.ingredient_name}
                  className={styles.input}
                  disabled
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="edit_category">Category</label>
                <select
                  id="edit_category"
                  value={editingItem.category || 'Other'}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className={styles.select}
                >
                  <option value="Produce">Produce</option>
                  <option value="Proteins">Proteins</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Grains & Pasta">Grains & Pasta</option>
                  <option value="Canned Goods">Canned Goods</option>
                  <option value="Baking">Baking</option>
                  <option value="Spices & Seasonings">Spices & Seasonings</option>
                  <option value="Condiments & Sauces">Condiments & Sauces</option>
                  <option value="Oils & Vinegars">Oils & Vinegars</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Snacks">Snacks</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="edit_quantity">Quantity</label>
                  <input
                    type="number"
                    id="edit_quantity"
                    step="0.1"
                    value={editingItem.quantity || ''}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) })
                    }
                    className={styles.input}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="edit_unit">Unit</label>
                  <select
                    id="edit_unit"
                    value={editingItem.unit || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                    className={styles.select}
                  >
                    <option value="cup">Cup</option>
                    <option value="tbsp">Tablespoon</option>
                    <option value="tsp">Teaspoon</option>
                    <option value="oz">Ounce</option>
                    <option value="lb">Pound</option>
                    <option value="g">Gram</option>
                    <option value="kg">Kilogram</option>
                    <option value="ml">Milliliter</option>
                    <option value="l">Liter</option>
                    <option value="count">Count</option>
                    <option value="can">Can</option>
                    <option value="jar">Jar</option>
                    <option value="bottle">Bottle</option>
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editingItem.is_staple}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, is_staple: e.target.checked })
                    }
                    className={styles.checkbox}
                  />
                  <span>Mark as staple</span>
                </label>
              </div>
              <div className={styles.modalActions}>
                <button onClick={handleUpdateItem} className={styles.submitButton}>
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingItem(null)}
                  className={styles.cancelButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pantryItems.length === 0 ? (
        <div className={styles.empty}>
          <p>Your pantry is empty. Add items using the button above!</p>
        </div>
      ) : (
        <div className={styles.categoriesGrid}>
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category} className={styles.categoryCard}>
              <h2>{category}</h2>
              <div className={styles.itemsList}>
                {items.map((item) => {
                  const isLowStock = (item.quantity || 0) < 5;
                  return (
                    <div key={item.id} className={`${styles.item} ${isLowStock ? styles.lowStock : ''}`}>
                      <div className={styles.itemContent}>
                        <div className={styles.itemInfo}>
                          <div className={styles.itemName}>
                            {item.ingredient_name}
                            {item.is_staple && <span className={styles.staple}>Staple</span>}
                          </div>
                          <div className={styles.itemQuantity}>
                            {item.quantity} {item.unit}
                            {isLowStock && <span className={styles.lowStockIndicator}>!</span>}
                          </div>
                        </div>
                        <div className={styles.itemActions}>
                          {isLowStock && (
                            <button
                              onClick={() => handleAddLowStockToGrocery(item)}
                              className={styles.groceryListButton}
                              title="Add to grocery list"
                            >
                              📋
                            </button>
                          )}
                          <button
                            onClick={() => handleEditItem(item)}
                            className={styles.editButton}
                            title="Edit item"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className={styles.removeButton}
                            title="Remove from pantry"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Pantry;
