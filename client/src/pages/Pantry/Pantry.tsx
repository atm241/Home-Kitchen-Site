import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { pantryApi, ingredientsApi, groceryApi, recipesApi, recommendationsApi, RecipeRecommendation, ParsedReceiptItem, UseItUpResult } from '../../services/api';
import { PantryItem, Ingredient } from '../../types';
import { getWeekStartDate } from '../../utils/dateUtils';
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner';
import Icon from '../../components/Icon/Icon';
import styles from './Pantry.module.css';

// Recommendation cards shown before "Show all" — keeps the pantry itself easy
// to reach now that the recommender surfaces the whole saved-recipe library.
const VISIBLE_RECOMMENDATIONS = 4;

// Shelf life comes from the server's shelf_life reference table, which matches
// on the ingredient name first (parmesan keeps far longer than milk) and falls
// back to the category. Returns '' when there's no data for the food.
const fetchSuggestedExpiry = async (name: string, category?: string): Promise<string> => {
  if (!name.trim()) return '';
  try {
    const response = await pantryApi.suggestedExpiry(name.trim(), category);
    return response.data.expiration_date || '';
  } catch {
    return '';
  }
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
  const [itemQuery, setItemQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [lowStockMenuId, setLowStockMenuId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newItem, setNewItem] = useState({
    ingredient_name: '',
    quantity: '',
    unit: 'cup',
    category: 'Other',
    is_staple: false,
    expiration_date: '',
  });
  // Tracks whether the date in the form was suggested rather than typed, so we
  // can refine our own guess but never overwrite the user's
  const [expiryWasSuggested, setExpiryWasSuggested] = useState(false);

  const suggestExpiryFor = async (name: string, category: string) => {
    if (newItem.expiration_date && !expiryWasSuggested) return;
    const suggested = await fetchSuggestedExpiry(name, category);
    if (!suggested) return;
    setNewItem(prev => ({ ...prev, expiration_date: suggested }));
    setExpiryWasSuggested(true);
  };
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

  // Close the low-stock dropdown on any outside click/tap
  useEffect(() => {
    if (lowStockMenuId === null) return;
    const close = () => setLowStockMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [lowStockMenuId]);

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
      setExpiryWasSuggested(false);
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
    setLowStockMenuId(null);
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
      const autoExpiry = await fetchSuggestedExpiry(product.name, product.category);
      setNewItem({
        ingredient_name: product.name,
        quantity: '1',
        unit: 'count',
        category: product.category,
        is_staple: false,
        expiration_date: autoExpiry,
      });
      setExpiryWasSuggested(!!autoExpiry);
      setShowAddForm(true);
      showNotification('success', `Found "${product.name}" — review and add it below.`);
    } catch {
      showNotification('error', 'No product found for that barcode. Try adding it manually.');
    } finally {
      setLookingUpBarcode(false);
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(pantryItems.map(i => i.category || 'Other'))).sort(),
    [pantryItems]
  );

  const groupedItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return pantryItems
      .filter(item => !q || item.ingredient_name.toLowerCase().includes(q))
      .filter(item => !activeCategory || (item.category || 'Other') === activeCategory)
      .reduce((acc, item) => {
        const category = item.category || 'Other';
        (acc[category] = acc[category] || []).push(item);
        return acc;
      }, {} as Record<string, PantryItem[]>);
  }, [pantryItems, itemQuery, activeCategory]);

  const lowStaples = pantryItems.filter(item => item.is_staple && (item.quantity || 0) < 5);

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
      <header className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <h1>Pantry</h1>
          <p className={styles.subtitle}>
            {pantryItems.length} item{pantryItems.length === 1 ? '' : 's'}
            {categories.length > 0 && ` in ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
        <div className={styles.toolbar}>
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className={`btn btn-secondary ${styles.toolButton}`}
            disabled={lookingUpBarcode}
            title="Scan a barcode"
          >
            <Icon name="barcode" size={18} />
            <span className={styles.toolLabel}>{lookingUpBarcode ? 'Looking up…' : 'Barcode'}</span>
          </button>
          <button
            onClick={() => setShowReceiptModal(true)}
            className={`btn btn-secondary ${styles.toolButton}`}
            title="Scan a receipt"
          >
            <Icon name="receipt" size={18} />
            <span className={styles.toolLabel}>Receipt</span>
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className={`btn ${showAddForm ? 'btn-secondary' : 'btn-primary'}`}>
            {showAddForm ? <><Icon name="x" size={16} /> Cancel</> : <><Icon name="plus" size={16} strokeWidth={2.5} /> Add item</>}
          </button>
        </div>
      </header>

      {/* Things that need attention, kept to one compact row each. */}
      {useItUp && useItUp.expiringItems.length > 0 && (
        <section className={styles.alertStrip}>
          <div className={styles.alertHead}>
            <Icon name="clock" size={18} />
            <strong>Use soon</strong>
          </div>
          <div className={styles.alertChips}>
            {useItUp.expiringItems.map(item => (
              <span
                key={item.id}
                className={`${styles.expiringChip} ${item.days_until_expiry < 0 ? styles.expiringChipExpired : item.days_until_expiry <= 2 ? styles.expiringChipUrgent : ''}`}
              >
                {item.ingredient_name}
                <span className={styles.expiringChipDays}>
                  {item.days_until_expiry < 0 ? 'expired' : item.days_until_expiry === 0 ? 'today' : `${item.days_until_expiry}d`}
                </span>
              </span>
            ))}
          </div>
          {useItUp.recipes.length > 0 && (
            <div className={styles.alertRecipes}>
              <span className={styles.alertRecipesLabel}>Cook:</span>
              {useItUp.recipes.slice(0, 3).map(recipe => (
                <Link key={recipe.id} to={`/recipes/${recipe.id}`} className={styles.alertRecipeLink}>
                  {recipe.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {lowStaples.length > 0 && (
        <section className={`${styles.alertStrip} ${styles.alertStripQuiet}`}>
          <div className={styles.alertHead}>
            <Icon name="alert" size={18} />
            <strong>{lowStaples.length} staple{lowStaples.length > 1 ? 's' : ''} running low</strong>
          </div>
          <span className={styles.alertNames}>{lowStaples.map(i => i.ingredient_name).join(', ')}</span>
          <button onClick={handleAddAllStaplesToGrocery} className={`btn btn-secondary ${styles.alertAction}`}>
            <Icon name="cart" size={16} /> Add to list
          </button>
        </section>
      )}

      {showAddForm && (
        <div className={styles.addFormCard}>
          <h2>Add an item</h2>
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
                  onBlur={(e) => suggestExpiryFor(e.target.value, newItem.category)}
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
                    setNewItem({ ...newItem, category: cat });
                    suggestExpiryFor(newItem.ingredient_name, cat);
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
                <label htmlFor="expiration_date">
                  Expiration Date (optional)
                  {expiryWasSuggested && newItem.expiration_date && (
                    <span className={styles.suggestedHint}> · estimated</span>
                  )}
                </label>
                <input
                  type="date"
                  id="expiration_date"
                  value={newItem.expiration_date}
                  onChange={(e) => {
                    setNewItem({ ...newItem, expiration_date: e.target.value });
                    setExpiryWasSuggested(false);
                  }}
                  className={styles.input}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Add to pantry
            </button>
          </form>
        </div>
      )}

      {editingItem && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Edit item</h2>
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
                <button onClick={handleUpdateItem} className="btn btn-primary">
                  Save changes
                </button>
                <button
                  onClick={() => setEditingItem(null)}
                  className="btn btn-secondary"
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
          <p>Your pantry is empty.</p>
          <p className={styles.emptyHint}>Add items one at a time, scan a barcode, or snap a grocery receipt to add everything at once.</p>
        </div>
      ) : (
        <>
          <div className={styles.listToolbar}>
            <div className={styles.searchWrap}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                type="search"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="Find an item"
                className={styles.search}
                aria-label="Search pantry"
              />
            </div>
            {categories.length > 1 && (
              <div className={styles.categoryChips} role="group" aria-label="Categories">
                <button
                  className={`chip ${activeCategory === null ? 'chip-active' : ''}`}
                  onClick={() => setActiveCategory(null)}
                  aria-pressed={activeCategory === null}
                >
                  All
                </button>
                {categories.map(c => (
                  <button
                    key={c}
                    className={`chip ${activeCategory === c ? 'chip-active' : ''}`}
                    onClick={() => setActiveCategory(activeCategory === c ? null : c)}
                    aria-pressed={activeCategory === c}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {Object.keys(groupedItems).length === 0 ? (
            <div className={styles.empty}><p>No items match.</p></div>
          ) : (
            <div className={styles.categoriesGrid}>
              {Object.entries(groupedItems).map(([category, items]) => (
                <section key={category} className={styles.categoryCard}>
                  <h2 className={styles.categoryTitle}>
                    {category}
                    <span className={styles.categoryCount}>{items.length}</span>
                  </h2>
                  <ul className={styles.itemsList}>
                    {items.map((item) => {
                      const isLowStock = (item.quantity || 0) < 5;
                      const expiryStatus = getExpiryStatus(item.expiration_date);
                      return (
                        <li key={item.id} className={`${styles.item} ${expiryStatus === 'expired' ? styles.expired : expiryStatus === 'soon' ? styles.expiringSoon : ''}`}>
                          <div className={styles.itemMain}>
                            <div className={styles.itemName}>
                              <span className={styles.itemNameText}>{item.ingredient_name}</span>
                              {item.is_staple && <span className={styles.staple}>Staple</span>}
                            </div>
                            <div className={styles.itemMeta}>
                              <span>{item.quantity} {item.unit}</span>
                              {editingExpiryId === item.id ? (
                                <span className={styles.expiryInlineEdit}>
                                  <input
                                    type="date"
                                    value={editingExpiryValue}
                                    onChange={e => setEditingExpiryValue(e.target.value)}
                                    className={styles.expiryDateInput}
                                    autoFocus
                                  />
                                  <button className={styles.expiryConfirmBtn} onClick={() => handleSaveInlineExpiry(item)} aria-label="Save date">
                                    <Icon name="check" size={14} strokeWidth={3} />
                                  </button>
                                  <button className={styles.expiryCancelBtn} onClick={() => setEditingExpiryId(null)} aria-label="Cancel">
                                    <Icon name="x" size={14} />
                                  </button>
                                </span>
                              ) : item.expiration_date ? (
                                <button
                                  className={`${styles.expiryDateBtn} ${expiryStatus === 'expired' ? styles.expiryBad : expiryStatus === 'soon' ? styles.expiryWarn : ''}`}
                                  onClick={() => { setEditingExpiryId(item.id); setEditingExpiryValue(item.expiration_date!); }}
                                  title="Change expiry date"
                                >
                                  {expiryStatus === 'expired' ? 'Expired ' : 'Exp. '}
                                  {new Date(item.expiration_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </button>
                              ) : (
                                <button
                                  className={styles.setExpiryBtn}
                                  onClick={async () => {
                                    setEditingExpiryId(item.id);
                                    setEditingExpiryValue(await fetchSuggestedExpiry(item.ingredient_name, item.category));
                                  }}
                                >
                                  + expiry
                                </button>
                              )}
                              {isLowStock && (
                                <span className={styles.lowStockWrapper}>
                                  <button
                                    className={styles.lowStockIndicator}
                                    title="Running low. Tap for options"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLowStockMenuId(lowStockMenuId === item.id ? null : item.id);
                                    }}
                                  >
                                    Low
                                  </button>
                                  {lowStockMenuId === item.id && (
                                    <div className={styles.lowStockMenu} onClick={(e) => e.stopPropagation()}>
                                      <button className={styles.lowStockMenuAction} onClick={() => handleAddLowStockToGrocery(item)}>
                                        <Icon name="cart" size={14} /> Add to grocery list
                                      </button>
                                    </div>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={styles.itemActions}>
                            <button onClick={() => handleEditItem(item)} className={styles.iconAction} aria-label={`Edit ${item.ingredient_name}`}>
                              <Icon name="edit" size={16} />
                            </button>
                            <button onClick={() => handleRemoveItem(item)} className={`${styles.iconAction} ${styles.iconActionDanger}`} aria-label={`Remove ${item.ingredient_name}`}>
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {/* Recipe ideas come last: the pantry list is what this page is for. */}
          <section className={styles.ideas}>
            <div className={styles.ideasHeader}>
              <div>
                <h2>Cook from your pantry</h2>
                <p className={styles.subtitle}>Recipes that use what you already have</p>
              </div>
              <div className={styles.ideasActions}>
                <Link to="/?filter=pantry" className="btn btn-ghost">See all in cookbook</Link>
                <button
                  onClick={handleRefreshRecommendations}
                  className={styles.iconAction}
                  disabled={loadingRecommendations}
                  aria-label="Refresh recipe ideas"
                >
                  <Icon name="refresh" size={16} />
                </button>
              </div>
            </div>
            {loadingRecommendations ? (
              <p className={styles.subtitle}>Finding recipes…</p>
            ) : recommendations.length === 0 ? (
              <p className={styles.subtitle}>No matches yet. Add more of what you have, or save more recipes.</p>
            ) : (
              <div className={styles.ideasGrid}>
                {(showAllRecommendations ? recommendations : recommendations.slice(0, VISIBLE_RECOMMENDATIONS)).map((recipe) => {
                  const saved = recipe.source === 'saved';
                  return (
                    <div key={`${recipe.source ?? 'spoonacular'}-${recipe.id}`} className={styles.ideaCard}>
                      {saved ? (
                        <Link to={`/recipes/${recipe.id}`} className={styles.ideaName}>{recipe.name}</Link>
                      ) : (
                        <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.ideaName}>{recipe.name}</a>
                      )}
                      <div className={styles.ideaMatch}>
                        <div className={styles.matchBar}>
                          <div className={styles.matchBarFill} style={{ width: `${recipe.matchPercentage}%` }} />
                        </div>
                        <span>{recipe.matchPercentage}%</span>
                      </div>
                      <p className={styles.ideaMissing}>
                        {recipe.missingIngredients.length === 0
                          ? 'You have everything'
                          : `Need: ${recipe.missingIngredients.join(', ')}`}
                      </p>
                      {!saved && (
                        <button onClick={() => handleAddRecipe(recipe.id)} className={styles.ideaSave}>
                          <Icon name="plus" size={14} strokeWidth={2.5} /> Save to cookbook
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {!loadingRecommendations && recommendations.length > VISIBLE_RECOMMENDATIONS && (
              <button onClick={() => setShowAllRecommendations((prev) => !prev)} className={`btn btn-ghost ${styles.showMore}`}>
                {showAllRecommendations ? 'Show fewer' : `Show all ${recommendations.length}`}
              </button>
            )}
          </section>
        </>
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
