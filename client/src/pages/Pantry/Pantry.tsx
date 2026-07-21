import React, { useState, useEffect } from 'react';
import { pantryApi, ingredientsApi, groceryApi, recipesApi, recommendationsApi, RecipeRecommendation, ParsedReceiptItem, UseItUpResult } from '../../services/api';
import { PantryItem, Ingredient } from '../../types';
import { getWeekStartDate } from '../../utils/dateUtils';
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner';
import styles from './Pantry.module.css';

const SHELF_LIFE_DAYS: Record<string, number> = {
  'Produce': 5,
  'Proteins': 3,
  'Dairy': 7,
  'Beverages': 7,
  'Snacks': 30,
  'Condiments & Sauces': 90,
  'Grains & Pasta': 180,
  'Oils & Vinegars': 365,
  'Baking': 365,
  'Canned Goods': 730,
  'Spices & Seasonings': 730,
};

const PERISHABLE_CATEGORIES = new Set(['Produce', 'Proteins', 'Dairy', 'Beverages']);

// Recommendation cards shown before "Show all" — keeps the pantry itself easy
// to reach now that the recommender surfaces the whole saved-recipe library.
const VISIBLE_RECOMMENDATIONS = 6;

const getSuggestedExpiryDate = (category: string): string => {
  const days = SHELF_LIFE_DAYS[category] ?? 7;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const getExpiryStatus = (expiration_date?: string): 'expired' | 'soon' | null => {
  if (!expiration_date) return null;
  const now = new Date();
  const exp = new Date(expiration_date);
  const diffDays = Math.floor((exp.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= 5) return 'soon';
  return null;
};

const Pantry: React.FC = () => {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [recommendations, setRecommendations] = useState<RecipeRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newItem, setNewItem] = useState({
    ingredient_name: '',
    quantity: '',
    unit: 'cup',
    category: 'Other',
    is_staple: false,
    expiration_date: '',
  });
  const [useItUp, setUseItUp] = useState<UseItUpResult | null>(null);
  const [editingExpiryId, setEditingExpiryId] = useState<number | null>(null);
  const [editingExpiryValue, setEditingExpiryValue] = useState('');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [receiptMediaType, setReceiptMediaType] = useState('image/jpeg');
  const [parsingReceipt, setParsingReceipt] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedReceiptItem[] | null>(null);
  const [addingReceiptItems, setAddingReceiptItems] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false);
  const [pendingRemovals, setPendingRemovals] = useState<
    { id: number; name: string; timeoutId: ReturnType<typeof setTimeout> }[]
  >([]);

  useEffect(() => {
    loadPantry();
    loadIngredients();
    loadRecommendations(false);
    loadUseItUp();
  }, []);

  const loadUseItUp = async () => {
    try {
      const response = await pantryApi.useItUp(5);
      setUseItUp(response.data);
    } catch (error) {
      console.error('Error loading use-it-up data:', error);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadRecommendations = async (forceRefresh = false) => {
    try {
      setLoadingRecommendations(true);
      const response = await recommendationsApi.get(forceRefresh);
      setRecommendations(response.data);
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleRefreshRecommendations = async () => {
    await loadRecommendations(true);
    showNotification('success', 'Recommendations refreshed!');
  };

  const handleAddRecipe = async (recipeId: number) => {
    try {
      await recipesApi.importFromSpoonacular(recipeId);
      showNotification('success', 'Recipe added successfully!');
    } catch (error) {
      console.error('Error adding recipe:', error);
      showNotification('error', 'Failed to add recipe');
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
        expiration_date: newItem.expiration_date || undefined,
      });

      // Reset form and reload pantry
      setNewItem({
        ingredient_name: '',
        quantity: '',
        unit: 'cup',
        category: 'Other',
        is_staple: false,
        expiration_date: '',
      });
      setShowAddForm(false);
      loadPantry();
    } catch (error) {
      console.error('Error adding pantry item:', error);
      showNotification('error', 'Failed to add item to pantry');
    }
  };

  const UNDO_WINDOW_MS = 6000;

  const handleRemoveItem = (item: PantryItem) => {
    setPantryItems(prev => prev.filter(p => p.id !== item.id));

    const timeoutId = setTimeout(async () => {
      try {
        await pantryApi.remove(item.id);
      } catch (error) {
        console.error('Error removing item:', error);
        showNotification('error', 'Failed to remove item');
        loadPantry();
      } finally {
        setPendingRemovals(prev => prev.filter(p => p.id !== item.id));
      }
    }, UNDO_WINDOW_MS);

    setPendingRemovals(prev => [...prev, { id: item.id, name: item.ingredient_name, timeoutId }]);
  };

  const handleUndoRemove = (id: number) => {
    setPendingRemovals(prev => {
      const entry = prev.find(p => p.id === id);
      if (entry) clearTimeout(entry.timeoutId);
      return prev.filter(p => p.id !== id);
    });
    loadPantry();
  };

  const handleEditItem = (item: PantryItem) => {
    setEditingItem(item);
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;

    try {
      // Update the ingredient's name and/or category if changed
      const ingredient = ingredients.find(
        (ing) => ing.id === editingItem.ingredient_id
      );

      if (ingredient) {
        const nameChanged = editingItem.ingredient_name !== ingredient.name;
        const categoryChanged = editingItem.category !== ingredient.category;

        if (nameChanged || categoryChanged) {
          await ingredientsApi.update(ingredient.id, {
            name: editingItem.ingredient_name,
            category: editingItem.category,
          });
          await loadIngredients(); // Reload ingredients list
        }
      }

      await pantryApi.update(editingItem.id, {
        quantity: editingItem.quantity,
        unit: editingItem.unit,
        is_staple: editingItem.is_staple,
        expiration_date: editingItem.expiration_date || undefined,
      });
      setEditingItem(null);
      loadPantry();
    } catch (error) {
      console.error('Error updating pantry item:', error);
      showNotification('error', 'Failed to update item');
    }
  };

  const handleAddAllStaplesToGrocery = async () => {
    const lowStockStaples = pantryItems.filter(item => item.is_staple && (item.quantity || 0) < 5);
    if (lowStockStaples.length === 0) {
      showNotification('error', 'No low-stock staples to add');
      return;
    }
    try {
      const weekStartDate = getWeekStartDate();
      for (const item of lowStockStaples) {
        await groceryApi.addManual({
          ingredient_name: item.ingredient_name,
          quantity: 5,
          unit: item.unit || 'unit',
          week_start_date: weekStartDate,
        });
      }
      showNotification('success', `Added ${lowStockStaples.length} low-stock staple${lowStockStaples.length > 1 ? 's' : ''} to grocery list!`);
    } catch (error) {
      console.error('Error adding staples to grocery:', error);
      showNotification('error', 'Failed to add staples to grocery list');
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

      showNotification('success', `${item.ingredient_name} added to grocery list!`);
    } catch (error) {
      console.error('Error adding to grocery list:', error);
      showNotification('error', 'Failed to add to grocery list');
    }
  };

  const handleSaveInlineExpiry = async (item: PantryItem) => {
    try {
      await pantryApi.update(item.id, {
        quantity: item.quantity,
        unit: item.unit,
        is_staple: item.is_staple,
        expiration_date: editingExpiryValue || undefined,
      });
      setEditingExpiryId(null);
      loadPantry();
      loadUseItUp();
    } catch {
      showNotification('error', 'Failed to update expiration date');
    }
  };

  const handleReceiptImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptMediaType(file.type || 'image/jpeg');
    setParsedItems(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setReceiptPreview(dataUrl);
      setReceiptBase64(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleParseReceipt = async () => {
    if (!receiptBase64) return;
    setParsingReceipt(true);
    try {
      const response = await pantryApi.parseReceipt({ image: receiptBase64, mediaType: receiptMediaType });
      setParsedItems(response.data);
    } catch {
      showNotification('error', 'Failed to parse receipt. Please try a clearer photo.');
    } finally {
      setParsingReceipt(false);
    }
  };

  const handleRemoveParsedItem = (idx: number) => {
    setParsedItems(prev => prev ? prev.filter((_, i) => i !== idx) : null);
  };

  const handleAddParsedItems = async () => {
    if (!parsedItems || parsedItems.length === 0) return;
    setAddingReceiptItems(true);
    try {
      for (const item of parsedItems) {
        await pantryApi.add({
          ingredient_id: item.ingredient_id,
          quantity: item.quantity,
          unit: item.unit,
          is_staple: false,
          expiration_date: item.expiration_date || undefined,
        });
      }
      showNotification('success', `Added ${parsedItems.length} items to your pantry!`);
      setShowReceiptModal(false);
      setReceiptPreview(null);
      setReceiptBase64(null);
      setParsedItems(null);
      loadPantry();
    } catch {
      showNotification('error', 'Failed to add some items to pantry');
    } finally {
      setAddingReceiptItems(false);
    }
  };

  const closeReceiptModal = () => {
    setShowReceiptModal(false);
    setReceiptPreview(null);
    setReceiptBase64(null);
    setParsedItems(null);
  };

  const handleBarcodeDetected = async (code: string) => {
    setShowBarcodeScanner(false);
    setLookingUpBarcode(true);
    try {
      const response = await pantryApi.lookupBarcode(code);
      const product = response.data;
      const autoExpiry = PERISHABLE_CATEGORIES.has(product.category)
        ? getSuggestedExpiryDate(product.category) : '';
      setNewItem({
        ingredient_name: product.name,
        quantity: '1',
        unit: 'count',
        category: product.category,
        is_staple: false,
        expiration_date: autoExpiry,
      });
      setShowAddForm(true);
      showNotification('success', `Found "${product.name}" — review and add it below.`);
    } catch {
      showNotification('error', 'No product found for that barcode. Try adding it manually.');
    } finally {
      setLookingUpBarcode(false);
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
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}
      <div className={styles.header}>
        <h1>Pantry</h1>
        <div className={styles.headerActions}>
          {pantryItems.some(item => item.is_staple && (item.quantity || 0) < 5) && (
            <button onClick={handleAddAllStaplesToGrocery} className={styles.staplesButton}>
              + Restock Staples
            </button>
          )}
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className={styles.scanReceiptButton}
            disabled={lookingUpBarcode}
          >
            {lookingUpBarcode ? 'Looking up...' : 'Scan Barcode'}
          </button>
          <button onClick={() => setShowReceiptModal(true)} className={styles.scanReceiptButton}>
            Scan Receipt
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className={styles.addButton}>
            {showAddForm ? 'Cancel' : 'Add Item'}
          </button>
        </div>
      </div>

      {/* Expiry Alert Banner */}
      {(() => {
        const expired = pantryItems.filter(i => getExpiryStatus(i.expiration_date) === 'expired');
        const soon = pantryItems.filter(i => getExpiryStatus(i.expiration_date) === 'soon');
        if (expired.length === 0 && soon.length === 0) return null;
        return (
          <div className={styles.expiryBanner}>
            <span className={styles.expiryBannerIcon}>⚠️</span>
            <span className={styles.expiryBannerText}>
              {expired.length > 0 && (
                <strong className={styles.expiredText}>
                  {expired.length} item{expired.length > 1 ? 's' : ''} expired
                </strong>
              )}
              {expired.length > 0 && soon.length > 0 && <span> · </span>}
              {soon.length > 0 && (
                <span>
                  {soon.length} item{soon.length > 1 ? 's' : ''} expire within 5 days
                </span>
              )}
            </span>
          </div>
        );
      })()}

      {/* Use It Up Section */}
      {useItUp && useItUp.expiringItems.length > 0 && (
        <div className={styles.useItUpSection}>
          <div className={styles.useItUpHeader}>
            <div>
              <h2 className={styles.useItUpTitle}>Use It Up</h2>
              <p className={styles.useItUpSubtitle}>
                {useItUp.expiringItems.length} ingredient{useItUp.expiringItems.length > 1 ? 's' : ''} expiring soon
              </p>
            </div>
          </div>

          <div className={styles.expiringChips}>
            {useItUp.expiringItems.map(item => (
              <span
                key={item.id}
                className={`${styles.expiringChip} ${item.days_until_expiry < 0 ? styles.expiringChipExpired : item.days_until_expiry <= 2 ? styles.expiringChipUrgent : styles.expiringChipSoon}`}
              >
                {item.ingredient_name}
                <span className={styles.expiringChipDays}>
                  {item.days_until_expiry < 0
                    ? 'expired'
                    : item.days_until_expiry === 0
                    ? 'today'
                    : `${item.days_until_expiry}d`}
                </span>
              </span>
            ))}
          </div>

          {useItUp.recipes.length > 0 ? (
            <div className={styles.useItUpRecipes}>
              {useItUp.recipes.map(recipe => (
                <a key={recipe.id} href={`/recipes/${recipe.id}`} className={styles.useItUpCard}>
                  {recipe.image_url && (
                    <img src={recipe.image_url} alt={recipe.name} className={styles.useItUpCardImg} />
                  )}
                  <div className={styles.useItUpCardBody}>
                    <div className={styles.useItUpCardName}>{recipe.name}</div>
                    <div className={styles.useItUpCardMeta}>
                      {recipe.prep_time && recipe.cook_time && (
                        <span>{recipe.prep_time + recipe.cook_time} min</span>
                      )}
                      {recipe.difficulty && <span>{recipe.difficulty}</span>}
                      {recipe.calories && <span>{recipe.calories} cal</span>}
                    </div>
                    <div className={styles.useItUpUsing}>
                      Uses:{' '}
                      {recipe.expiring_ingredients
                        .sort((a, b) => a.days_until_expiry - b.days_until_expiry)
                        .map((ing, i) => (
                          <span
                            key={i}
                            className={`${styles.useItUpIngredient} ${ing.days_until_expiry <= 2 ? styles.useItUpIngredientUrgent : ''}`}
                          >
                            {ing.name}
                          </span>
                        ))}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className={styles.useItUpNoRecipes}>
              No saved recipes use these ingredients yet. Try importing a recipe that calls for them!
            </p>
          )}
        </div>
      )}

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
              {(showAllRecommendations ? recommendations : recommendations.slice(0, VISIBLE_RECOMMENDATIONS)).map((recipe) => (
                <div key={`${recipe.source ?? 'spoonacular'}-${recipe.id}`} className={styles.recipeCard}>
                  {recipe.image && (
                    <img src={recipe.image} alt={recipe.name} className={styles.recipeImage} />
                  )}
                  <div className={styles.recipeContent}>
                    <h3 className={styles.recipeName}>{recipe.name}</h3>
                    <div className={styles.recipeMetadata}>
                      {recipe.source === 'saved' ? (
                        <span className={styles.recipeRating}>📌 Saved</span>
                      ) : (
                        <span className={styles.recipeRating}>⭐ {recipe.rating.toFixed(1)}</span>
                      )}
                      {recipe.prepTime > 0 && (
                        <span className={styles.recipeTime}>🕐 {recipe.prepTime} min</span>
                      )}
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
                      {recipe.source !== 'saved' && (
                        <button
                          onClick={() => handleAddRecipe(recipe.id)}
                          className={styles.addRecipeButton}
                          title="Add to my recipes"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loadingRecommendations && recommendations.length > VISIBLE_RECOMMENDATIONS && (
            <button
              onClick={() => setShowAllRecommendations((prev) => !prev)}
              className={styles.showMoreButton}
            >
              {showAllRecommendations
                ? 'Show fewer'
                : `Show all ${recommendations.length} recipes`}
            </button>
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
                  onChange={(e) => {
                    const cat = e.target.value;
                    const autoExpiry = !newItem.expiration_date && PERISHABLE_CATEGORIES.has(cat)
                      ? getSuggestedExpiryDate(cat) : newItem.expiration_date;
                    setNewItem({ ...newItem, category: cat, expiration_date: autoExpiry });
                  }}
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
            <div className={styles.formRow}>
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
              <div className={styles.formGroup}>
                <label htmlFor="expiration_date">Expiration Date (optional)</label>
                <input
                  type="date"
                  id="expiration_date"
                  value={newItem.expiration_date}
                  onChange={(e) => setNewItem({ ...newItem, expiration_date: e.target.value })}
                  className={styles.input}
                />
              </div>
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
                <label htmlFor="edit_ingredient_name">Ingredient Name</label>
                <input
                  type="text"
                  id="edit_ingredient_name"
                  value={editingItem.ingredient_name}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, ingredient_name: e.target.value })
                  }
                  className={styles.input}
                  required
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
              <div className={styles.formGroup}>
                <label htmlFor="edit_expiration_date">Expiration Date (optional)</label>
                <input
                  type="date"
                  id="edit_expiration_date"
                  value={editingItem.expiration_date || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, expiration_date: e.target.value })}
                  className={styles.input}
                />
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
                  const expiryStatus = getExpiryStatus(item.expiration_date);
                  return (
                    <div key={item.id} className={`${styles.item} ${isLowStock ? styles.lowStock : ''} ${expiryStatus === 'expired' ? styles.expired : expiryStatus === 'soon' ? styles.expiringSoon : ''}`}>
                      <div className={styles.itemContent}>
                        <div className={styles.itemInfo}>
                          <div className={styles.itemName}>
                            {item.ingredient_name}
                            {item.is_staple && <span className={styles.staple}>Staple</span>}
                            {expiryStatus === 'expired' && <span className={styles.expiredBadge}>Expired</span>}
                            {expiryStatus === 'soon' && <span className={styles.expiringSoonBadge}>Exp. soon</span>}
                          </div>
                          <div className={styles.itemQuantity}>
                            {item.quantity} {item.unit}
                            {editingExpiryId === item.id ? (
                              <span className={styles.expiryInlineEdit}>
                                <input
                                  type="date"
                                  value={editingExpiryValue}
                                  onChange={e => setEditingExpiryValue(e.target.value)}
                                  className={styles.expiryDateInput}
                                  autoFocus
                                />
                                <button
                                  className={styles.expiryConfirmBtn}
                                  onClick={() => handleSaveInlineExpiry(item)}
                                  title="Save"
                                >✓</button>
                                <button
                                  className={styles.expiryCancelBtn}
                                  onClick={() => setEditingExpiryId(null)}
                                  title="Cancel"
                                >✗</button>
                              </span>
                            ) : item.expiration_date ? (
                              <button
                                className={styles.expiryDateBtn}
                                onClick={() => { setEditingExpiryId(item.id); setEditingExpiryValue(item.expiration_date!); }}
                                title="Click to edit expiry date"
                              >
                                exp. {new Date(item.expiration_date).toLocaleDateString()}
                              </button>
                            ) : PERISHABLE_CATEGORIES.has(item.category || '') ? (
                              <button
                                className={styles.setExpiryBtn}
                                onClick={() => { setEditingExpiryId(item.id); setEditingExpiryValue(getSuggestedExpiryDate(item.category || 'Other')); }}
                              >
                                + Set expiry
                              </button>
                            ) : null}
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
                            onClick={() => handleRemoveItem(item)}
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

      {showReceiptModal && (
        <div className={styles.receiptModalOverlay} onClick={closeReceiptModal}>
          <div className={styles.receiptModal} onClick={e => e.stopPropagation()}>
            <div className={styles.receiptModalHeader}>
              <h2>Scan Receipt</h2>
              <button className={styles.receiptModalClose} onClick={closeReceiptModal}>×</button>
            </div>

            {!parsedItems ? (
              <div className={styles.receiptPickerSection}>
                <label className={styles.receiptImageLabel}>
                  {receiptPreview ? (
                    <img src={receiptPreview} alt="Receipt preview" className={styles.receiptPreview} />
                  ) : (
                    <div className={styles.receiptPickerPlaceholder}>
                      <span className={styles.receiptPickerIcon}>📷</span>
                      <p>Tap to take a photo or upload an image of your receipt</p>
                      <span className={styles.receiptPickerHint}>Supports JPEG, PNG, WebP</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptImageChange}
                    className={styles.receiptFileInput}
                  />
                </label>
                {receiptPreview && (
                  <>
                    <button
                      className={styles.parseReceiptButton}
                      onClick={handleParseReceipt}
                      disabled={parsingReceipt}
                    >
                      {parsingReceipt ? 'Scanning...' : 'Extract Items from Receipt'}
                    </button>
                    {parsingReceipt && (
                      <p className={styles.parsingHint}>Analyzing with AI — this takes a few seconds...</p>
                    )}
                  </>
                )}
              </div>
            ) : parsedItems.length === 0 ? (
              <div className={styles.noParsedItems}>
                <p>No grocery items could be detected.</p>
                <p>Try a clearer photo with better lighting.</p>
                <button className={styles.tryAgainButton} onClick={() => setParsedItems(null)}>
                  Try Again
                </button>
              </div>
            ) : (
              <div className={styles.parsedItemsSection}>
                <p className={styles.parsedCount}>
                  Found <strong>{parsedItems.length}</strong> items. Remove any you don't want.
                </p>
                <div className={styles.parsedList}>
                  {parsedItems.map((item, idx) => (
                    <div key={idx} className={styles.parsedItem}>
                      <div className={styles.parsedItemInfo}>
                        <span className={styles.parsedItemName}>{item.name}</span>
                        <span className={styles.parsedItemDetails}>
                          {item.quantity} {item.unit} · {item.category}
                        </span>
                        {item.expiration_date !== null && (
                          <span className={styles.parsedItemExpiryRow}>
                            <label className={styles.parsedItemExpiryLabel}>Exp:</label>
                            <input
                              type="date"
                              value={item.expiration_date || ''}
                              onChange={e => {
                                const updated = [...parsedItems];
                                updated[idx] = { ...item, expiration_date: e.target.value };
                                setParsedItems(updated);
                              }}
                              className={styles.parsedItemDateInput}
                            />
                          </span>
                        )}
                      </div>
                      <button
                        className={styles.parsedItemRemove}
                        onClick={() => handleRemoveParsedItem(idx)}
                        title="Remove this item"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className={styles.receiptModalActions}>
                  <button className={styles.tryAgainButton} onClick={() => setParsedItems(null)}>
                    Try Again
                  </button>
                  <button
                    className={styles.addParsedButton}
                    onClick={handleAddParsedItems}
                    disabled={addingReceiptItems || parsedItems.length === 0}
                  >
                    {addingReceiptItems ? 'Adding...' : `Add ${parsedItems.length} Items to Pantry`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showBarcodeScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}

      {pendingRemovals.length > 0 && (
        <div className={styles.undoToastContainer}>
          {pendingRemovals.map(entry => (
            <div key={entry.id} className={styles.undoToast}>
              <span>{entry.name} removed</span>
              <button className={styles.undoButton} onClick={() => handleUndoRemove(entry.id)}>
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Pantry;
