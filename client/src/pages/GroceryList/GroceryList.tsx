import React, { useState, useEffect } from 'react';
import { groceryApi, recommendationsApi, IngredientCombo } from '../../services/api';
import { GroceryItem } from '../../types';
import { getWeekStartDate, getWeekEndDate } from '../../utils/dateUtils';
import styles from './GroceryList.module.css';

const GroceryList: React.FC = () => {
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [ingredientCombos, setIngredientCombos] = useState<IngredientCombo[]>([]);
  const [loadingCombos, setLoadingCombos] = useState(false);
  const weekStartDate = getWeekStartDate();
  const [manualItem, setManualItem] = useState({ name: '', quantity: '1', unit: 'unit' });

  useEffect(() => {
    loadGroceryList();
    loadIngredientCombos();
  }, []);

  const loadIngredientCombos = async (forceRefresh = false) => {
    try {
      setLoadingCombos(true);
      const url = forceRefresh
        ? 'http://localhost:5001/api/recommendations/ingredient-combos?refresh=true'
        : 'http://localhost:5001/api/recommendations/ingredient-combos';
      const response = await fetch(url);
      const data = await response.json();
      setIngredientCombos(data);
    } catch (error) {
      console.error('Error loading ingredient combos:', error);
    } finally {
      setLoadingCombos(false);
    }
  };

  const handleRefreshCombos = async () => {
    await loadIngredientCombos(true);
    alert('Ingredient combos refreshed!');
  };

  const handleAddComboToList = async (combo: IngredientCombo) => {
    try {
      // Add each ingredient in the combo to the grocery list
      for (const ingredient of combo.ingredients) {
        await groceryApi.addManual({
          ingredient_name: ingredient.name,
          quantity: 1,
          unit: 'unit',
          week_start_date: weekStartDate,
        });
      }

      alert(`Added ${combo.ingredients.length} ingredients to your grocery list!`);
      await loadGroceryList(); // Reload the list
    } catch (error) {
      console.error('Error adding combo to list:', error);
      alert('Failed to add ingredients to list');
    }
  };

  const loadGroceryList = async () => {
    try {
      setLoading(true);
      const response = await groceryApi.getList(weekStartDate);
      setGroceryItems(response.data);
    } catch (error) {
      console.error('Error loading grocery list:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const weekEndDate = getWeekEndDate();
      const response = await groceryApi.generate({
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,
      });
      setGroceryItems(response.data);
    } catch (error) {
      console.error('Error generating grocery list:', error);
      alert('Failed to generate grocery list');
    } finally {
      setGenerating(false);
    }
  };

  const handleTogglePurchased = async (id: number, isPurchased: boolean) => {
    try {
      await groceryApi.markPurchased(id, isPurchased);
      setGroceryItems(
        groceryItems.map((item) =>
          item.id === id ? { ...item, is_purchased: isPurchased } : item
        )
      );
    } catch (error) {
      console.error('Error updating grocery item:', error);
    }
  };

  const handleAddManualItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!manualItem.name.trim()) {
      alert('Please enter an item name');
      return;
    }

    try {
      const response = await groceryApi.addManual({
        ingredient_name: manualItem.name.trim(),
        quantity: parseFloat(manualItem.quantity) || 1,
        unit: manualItem.unit,
        week_start_date: weekStartDate,
      });

      setGroceryItems([...groceryItems, response.data]);
      setManualItem({ name: '', quantity: '1', unit: 'unit' });
    } catch (error) {
      console.error('Error adding manual item:', error);
      alert('Failed to add item');
    }
  };

  const handleDeleteItem = async (id: number) => {
    try {
      await groceryApi.delete(id);
      setGroceryItems(groceryItems.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error deleting grocery item:', error);
      alert('Failed to delete item');
    }
  };

  const handleClearList = async () => {
    if (!window.confirm('Are you sure you want to clear the entire grocery list?')) {
      return;
    }

    try {
      await groceryApi.clearList(weekStartDate);
      setGroceryItems([]);
    } catch (error) {
      console.error('Error clearing grocery list:', error);
      alert('Failed to clear grocery list');
    }
  };

  const handleAddToPantry = async () => {
    const purchasedItems = groceryItems.filter(item => item.is_purchased);

    if (purchasedItems.length === 0) {
      alert('No purchased items to add to pantry. Please check off items first.');
      return;
    }

    if (!window.confirm(`Add ${purchasedItems.length} purchased items to pantry?`)) {
      return;
    }

    try {
      const response = await groceryApi.addPurchasedToPantry(weekStartDate);
      alert(`Successfully added ${response.data.count} items to pantry!`);
    } catch (error) {
      console.error('Error adding items to pantry:', error);
      alert('Failed to add items to pantry');
    }
  };

  const groupedItems = groceryItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, GroceryItem[]>);

  const totalEstimatedCost = groceryItems.reduce(
    (sum, item) => sum + (item.estimated_price || 0) * (item.quantity || 1),
    0
  );

  const purchasedCount = groceryItems.filter((item) => item.is_purchased).length;

  if (loading) {
    return <div className={styles.loading}>Loading grocery list...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Grocery List</h1>
        <div className={styles.buttonGroup}>
          <button
            onClick={handleGenerate}
            className={styles.generateButton}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate from Meals'}
          </button>
          {groceryItems.length > 0 && (
            <>
              <button
                onClick={handleAddToPantry}
                className={styles.addToPantryButton}
                disabled={purchasedCount === 0}
              >
                Add to Pantry ({purchasedCount})
              </button>
              <button
                onClick={handleClearList}
                className={styles.clearButton}
              >
                Clear List
              </button>
            </>
          )}
        </div>
      </div>

      {/* Ingredient Combo Recommendations */}
      <div className={styles.recommendationsSection}>
        <div className={styles.recommendationsHeader}>
          <div className={styles.headerContent}>
            <h2>Recommended Ingredient Combos</h2>
            <p>Buy these ingredients to unlock popular recipes</p>
          </div>
          <button
            onClick={handleRefreshCombos}
            className={styles.refreshButton}
            disabled={loadingCombos}
            title="Get fresh ingredient combos"
          >
            🔄
          </button>
        </div>
        {loadingCombos ? (
          <div className={styles.loadingRecommendations}>Loading recommendations...</div>
        ) : ingredientCombos.length === 0 ? (
          <div className={styles.noRecommendations}>
            No ingredient combo recommendations found. Add more ingredients to your pantry!
          </div>
        ) : (
          <div className={styles.combosGrid}>
              {ingredientCombos.map((combo) => (
                <div key={combo.id} className={styles.comboCard}>
                  <div className={styles.comboHeader}>
                    <h3>Unlock {combo.recipeCount} Recipe{combo.recipeCount > 1 ? 's' : ''}</h3>
                  </div>

                  <div className={styles.ingredientsList}>
                    {combo.ingredients.map((ingredient, idx) => (
                      <div key={idx} className={styles.ingredientItem}>
                        {ingredient.image && (
                          <img
                            src={ingredient.image}
                            alt={ingredient.name}
                            className={styles.ingredientImage}
                          />
                        )}
                        <span className={styles.ingredientName}>{ingredient.name}</span>
                      </div>
                    ))}
                  </div>

                  <div className={styles.recipesPreview}>
                    <strong>You'll be able to make:</strong>
                    <ul className={styles.recipesList}>
                      {combo.unlockedRecipes.map((recipe) => (
                        <li key={recipe.id}>{recipe.title}</li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleAddComboToList(combo)}
                    className={styles.addComboButton}
                  >
                    Add All to List
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {groceryItems.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Items:</span>
            <span className={styles.summaryValue}>{groceryItems.length}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Purchased:</span>
            <span className={styles.summaryValue}>
              {purchasedCount} / {groceryItems.length}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Estimated Cost:</span>
            <span className={styles.summaryValue}>${totalEstimatedCost.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className={styles.manualEntrySection}>
        <h2>Add Item Manually</h2>
        <form onSubmit={handleAddManualItem} className={styles.manualEntryForm}>
          <input
            type="text"
            placeholder="Item name"
            value={manualItem.name}
            onChange={(e) => setManualItem({ ...manualItem, name: e.target.value })}
            className={styles.input}
          />
          <input
            type="number"
            step="0.1"
            placeholder="Quantity"
            value={manualItem.quantity}
            onChange={(e) => setManualItem({ ...manualItem, quantity: e.target.value })}
            className={styles.inputSmall}
          />
          <select
            value={manualItem.unit}
            onChange={(e) => setManualItem({ ...manualItem, unit: e.target.value })}
            className={styles.select}
          >
            <option value="unit">unit</option>
            <option value="cup">cup</option>
            <option value="tablespoon">tablespoon</option>
            <option value="teaspoon">teaspoon</option>
            <option value="ounce">ounce</option>
            <option value="pound">pound</option>
            <option value="gram">gram</option>
            <option value="kilogram">kilogram</option>
            <option value="liter">liter</option>
            <option value="milliliter">milliliter</option>
          </select>
          <button type="submit" className={styles.addButton}>
            Add Item
          </button>
        </form>
      </div>

      {groceryItems.length === 0 ? (
        <div className={styles.empty}>
          <p>No items in your grocery list</p>
          <p>Click "Generate from Meals" to create a list based on your scheduled meals or add items manually above</p>
        </div>
      ) : (
        <div className={styles.categoriesGrid}>
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category} className={styles.categoryCard}>
              <h2>{category}</h2>
              <div className={styles.itemsList}>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`${styles.item} ${
                      item.is_purchased ? styles.purchased : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.is_purchased}
                      onChange={(e) => handleTogglePurchased(item.id, e.target.checked)}
                      className={styles.checkbox}
                    />
                    <div className={styles.itemInfo}>
                      <div className={styles.itemName}>{item.ingredient_name}</div>
                      <div className={styles.itemDetails}>
                        {item.quantity} {item.unit}
                        {item.estimated_price && (
                          <span className={styles.price}>
                            ${(item.estimated_price * (item.quantity || 1)).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className={styles.deleteButton}
                      title="Remove from list"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroceryList;
