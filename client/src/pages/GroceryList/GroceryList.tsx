import React, { useState, useEffect, useMemo } from 'react';
import { groceryApi, recommendationsApi, plannerApi, IngredientCombo, BudgetStatus } from '../../services/api';
import { GroceryItem } from '../../types';
import { getWeekStartDate, getWeekEndDate, formatDate } from '../../utils/dateUtils';
import Icon from '../../components/Icon/Icon';
import LogReceiptDialog from '../../components/LogReceipt/LogReceiptDialog';
import styles from './GroceryList.module.css';

const UNITS = ['unit', 'cup', 'tablespoon', 'teaspoon', 'ounce', 'pound', 'gram', 'kilogram', 'liter', 'milliliter'];

const groupByCategory = (items: GroceryItem[]) =>
  items.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, GroceryItem[]>);

const formatQty = (item: GroceryItem) =>
  [item.quantity, item.unit && item.unit !== 'unit' ? item.unit : ''].filter(Boolean).join(' ');

const GroceryList: React.FC = () => {
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [ingredientCombos, setIngredientCombos] = useState<IngredientCombo[]>([]);
  const [loadingCombos, setLoadingCombos] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [shoppingMode, setShoppingMode] = useState(false);
  const weekStartDate = getWeekStartDate();
  const [manualItem, setManualItem] = useState({ name: '', quantity: '1', unit: 'unit' });

  useEffect(() => {
    loadGroceryList();
    loadIngredientCombos(false); // Only load cached combos
    loadBudget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBudget = () => {
    plannerApi.status().then((r) => setBudget(r.data.budget)).catch(() => {});
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadIngredientCombos = async (forceRefresh = false) => {
    try {
      setLoadingCombos(true);
      const response = await recommendationsApi.getIngredientCombos(forceRefresh);
      setIngredientCombos(response.data);
    } catch (error) {
      console.error('Error loading ingredient combos:', error);
    } finally {
      setLoadingCombos(false);
    }
  };

  const handleRefreshCombos = async () => {
    await loadIngredientCombos(true);
    showNotification('success', 'Ingredient ideas refreshed');
  };

  const handleAddComboToList = async (combo: IngredientCombo) => {
    try {
      for (const ingredient of combo.ingredients) {
        await groceryApi.addManual({
          ingredient_name: ingredient.name,
          quantity: 1,
          unit: 'unit',
          week_start_date: weekStartDate,
        });
      }
      showNotification('success', `Added ${combo.ingredients.length} items to your list`);
      await loadGroceryList();
    } catch (error) {
      console.error('Error adding combo to list:', error);
      showNotification('error', 'Failed to add ingredients to list');
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
      const response = await groceryApi.generate({
        week_start_date: weekStartDate,
        week_end_date: getWeekEndDate(),
      });
      setGroceryItems(response.data);
    } catch (error) {
      console.error('Error generating grocery list:', error);
      showNotification('error', 'Failed to build the list from your meal plan');
    } finally {
      setGenerating(false);
    }
  };

  const handleTogglePurchased = async (id: number, isPurchased: boolean) => {
    // Update right away so checking things off in the store feels instant.
    setGroceryItems((items) => items.map((item) => (item.id === id ? { ...item, is_purchased: isPurchased } : item)));
    try {
      await groceryApi.markPurchased(id, isPurchased);
    } catch (error) {
      console.error('Error updating grocery item:', error);
      setGroceryItems((items) => items.map((item) => (item.id === id ? { ...item, is_purchased: !isPurchased } : item)));
      showNotification('error', 'Could not update that item');
    }
  };

  const handleAddManualItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItem.name.trim()) return;

    try {
      const response = await groceryApi.addManual({
        ingredient_name: manualItem.name.trim(),
        quantity: parseFloat(manualItem.quantity) || 1,
        unit: manualItem.unit,
        week_start_date: weekStartDate,
      });
      setGroceryItems((items) => [...items, response.data]);
      setManualItem({ name: '', quantity: '1', unit: 'unit' });
    } catch (error) {
      console.error('Error adding manual item:', error);
      showNotification('error', 'Failed to add item');
    }
  };

  const handleDeleteItem = async (id: number) => {
    try {
      await groceryApi.delete(id);
      setGroceryItems((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error deleting grocery item:', error);
      showNotification('error', 'Failed to delete item');
    }
  };

  const handleClearList = async () => {
    if (!window.confirm('Clear the whole grocery list?')) return;
    try {
      await groceryApi.clearList(weekStartDate);
      setGroceryItems([]);
    } catch (error) {
      console.error('Error clearing grocery list:', error);
      showNotification('error', 'Failed to clear grocery list');
    }
  };

  const purchasedCount = groceryItems.filter((item) => item.is_purchased).length;

  const handleAddToPantry = async () => {
    if (purchasedCount === 0) return;
    if (!window.confirm(`Add ${purchasedCount} checked item${purchasedCount === 1 ? '' : 's'} to your pantry?`)) return;

    try {
      const response = await groceryApi.addPurchasedToPantry(weekStartDate);
      showNotification('success', `Added ${response.data.count} items to your pantry`);
      await loadIngredientCombos(false);
    } catch (error) {
      console.error('Error adding items to pantry:', error);
      showNotification('error', 'Failed to add items to pantry');
    }
  };

  const groupedItems = useMemo(() => groupByCategory(groceryItems), [groceryItems]);

  const totalEstimatedCost = groceryItems.reduce(
    (sum, item) => sum + (item.estimated_price || 0) * (item.quantity || 1),
    0
  );

  const handleShareList = async () => {
    const lines: string[] = ['Grocery list'];
    for (const [category, items] of Object.entries(groupedItems)) {
      lines.push('', `${category}:`);
      for (const item of items) {
        const check = item.is_purchased ? '✓' : '○';
        lines.push(`  ${check} ${[formatQty(item), item.ingredient_name].filter(Boolean).join(' ')}`);
      }
    }
    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      showNotification('success', 'List copied, ready to paste');
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'grocery-list.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading grocery list…</div>;
  }

  const total = groceryItems.length;
  const progress = total > 0 ? (purchasedCount / total) * 100 : 0;

  if (shoppingMode) {
    const remaining = total - purchasedCount;
    return (
      <div className={styles.shoppingOverlay}>
        <div className={styles.shoppingTopBar}>
          <div className={styles.shoppingTopRow}>
            <div>
              <div className={styles.shoppingTitle}>Shopping</div>
              <div className={styles.shoppingProgressLabel}>
                {remaining === 0 ? 'All done' : `${remaining} left of ${total}`}
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShoppingMode(false)}>
              {remaining === 0 ? <><Icon name="check" size={16} strokeWidth={2.5} /> Done</> : 'Exit'}
            </button>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className={styles.shoppingList}>
          {Object.entries(groupedItems).map(([category, items]) => {
            const sorted = [...items.filter((i) => !i.is_purchased), ...items.filter((i) => i.is_purchased)];
            return (
              <section key={category} className={styles.shoppingCategory}>
                <h2 className={styles.categoryTitle}>{category}</h2>
                {sorted.map((item) => (
                  <button
                    key={item.id}
                    className={`${styles.shoppingItem} ${item.is_purchased ? styles.checked : ''}`}
                    onClick={() => handleTogglePurchased(item.id, !item.is_purchased)}
                    aria-pressed={item.is_purchased}
                  >
                    <span className={styles.checkCircle}>
                      {item.is_purchased && <Icon name="check" size={16} strokeWidth={3} />}
                    </span>
                    <span className={styles.shoppingItemName}>{item.ingredient_name}</span>
                    {formatQty(item) && <span className={styles.shoppingItemQty}>{formatQty(item)}</span>}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`} role="status">
          {notification.message}
        </div>
      )}

      <header className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <h1>Grocery list</h1>
          <p className={styles.subtitle}>
            Week of {formatDate(weekStartDate, 'MMM d')}
            {total > 0 && <> · {total} item{total === 1 ? '' : 's'}</>}
            {totalEstimatedCost > 0 && <> · about ${totalEstimatedCost.toFixed(2)}</>}
          </p>
          {budget && (
            <p className={`${styles.budgetLine} ${budget.remaining < 0 ? styles.budgetOver : ''}`}>
              ${Math.abs(budget.remaining).toFixed(0)} {budget.remaining < 0 ? 'over' : 'left'} of your ${budget.amount.toFixed(0)} budget
              <span> · through {formatDate(budget.end_date, 'MMM d')}</span>
            </p>
          )}
        </div>
        <div className={styles.toolbar}>
          <button onClick={handleGenerate} className="btn btn-secondary" disabled={generating} title="Add ingredients for this week's planned meals">
            <Icon name="calendar" size={17} />
            <span className={styles.toolLabel}>{generating ? 'Building…' : 'From meal plan'}</span>
          </button>
          {total > 0 && (
            <>
              <button onClick={handleShareList} className="btn btn-secondary" title="Copy list as text">
                <Icon name="copy" size={17} />
                <span className={styles.toolLabel}>Copy</span>
              </button>
              <button onClick={() => setShoppingMode(true)} className="btn btn-primary">
                <Icon name="cart" size={17} /> Start shopping
              </button>
            </>
          )}
        </div>
      </header>

      <form onSubmit={handleAddManualItem} className={styles.quickAdd}>
        <Icon name="plus" size={18} className={styles.quickAddIcon} />
        <input
          type="text"
          placeholder="Add an item…"
          value={manualItem.name}
          onChange={(e) => setManualItem({ ...manualItem, name: e.target.value })}
          className={styles.quickAddName}
          aria-label="Item name"
        />
        <input
          type="number"
          step="0.1"
          min="0"
          value={manualItem.quantity}
          onChange={(e) => setManualItem({ ...manualItem, quantity: e.target.value })}
          className={styles.quickAddQty}
          aria-label="Quantity"
        />
        <select
          value={manualItem.unit}
          onChange={(e) => setManualItem({ ...manualItem, unit: e.target.value })}
          className={styles.quickAddUnit}
          aria-label="Unit"
        >
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <button type="submit" className={`btn btn-primary ${styles.quickAddButton}`} disabled={!manualItem.name.trim()}>
          Add
        </button>
      </form>

      {total > 0 && (
        <div className={styles.progressStrip}>
          <div className={styles.progressInfo}>
            <span className={styles.progressText}>
              <strong>{purchasedCount}</strong> of {total} checked off
            </span>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className={styles.progressActions}>
            {purchasedCount > 0 && (
              <button onClick={handleAddToPantry} className={`btn btn-secondary ${styles.smallBtn}`}>
                <Icon name="pantry" size={15} /> Move {purchasedCount} to pantry
              </button>
            )}
            <button onClick={() => setShowReceipt(true)} className={`btn btn-ghost ${styles.smallBtn}`} title="Log what you paid at the store">
              <Icon name="receipt" size={15} /> Log receipt
            </button>
            <button onClick={handleClearList} className={`btn btn-ghost ${styles.smallBtn} ${styles.dangerGhost}`} title="Clear list">
              <Icon name="trash" size={15} />
              <span className={styles.toolLabel}>Clear</span>
            </button>
          </div>
        </div>
      )}

      {total === 0 ? (
        <div className={styles.empty}>
          <Icon name="cart" size={28} className={styles.emptyIcon} />
          <p>Your list is empty.</p>
          <p className={styles.emptyHint}>
            Add items above, use "From meal plan" to pull in this week's recipes, or add missing ingredients from any recipe page.
          </p>
        </div>
      ) : (
        <div className={styles.categoriesGrid}>
          {Object.entries(groupedItems).map(([category, items]) => (
            <section key={category} className={styles.categoryCard}>
              <h2 className={styles.categoryTitle}>
                {category}
                <span className={styles.categoryCount}>{items.length}</span>
              </h2>
              <ul className={styles.itemsList}>
                {items.map((item) => (
                  <li key={item.id} className={`${styles.item} ${item.is_purchased ? styles.checked : ''}`}>
                    <button
                      className={styles.checkCircle}
                      onClick={() => handleTogglePurchased(item.id, !item.is_purchased)}
                      aria-pressed={item.is_purchased}
                      aria-label={`${item.is_purchased ? 'Uncheck' : 'Check off'} ${item.ingredient_name}`}
                    >
                      {item.is_purchased && <Icon name="check" size={14} strokeWidth={3} />}
                    </button>
                    <div className={styles.itemMain}>
                      <div className={styles.itemName}>{item.ingredient_name}</div>
                      {(formatQty(item) || item.estimated_price) && (
                        <div className={styles.itemMeta}>
                          {formatQty(item) && <span>{formatQty(item)}</span>}
                          {item.estimated_price ? (
                            <span>~${(item.estimated_price * (item.quantity || 1)).toFixed(2)}</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className={styles.iconAction}
                      aria-label={`Remove ${item.ingredient_name}`}
                      title="Remove"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {showReceipt && (
        <LogReceiptDialog
          onClose={() => setShowReceipt(false)}
          onSaved={(r) => {
            setShowReceipt(false);
            loadBudget();
            showNotification('success', `Logged $${r.total.toFixed(2)}`);
          }}
        />
      )}

      <section className={styles.ideas}>
        <div className={styles.ideasHeader}>
          <div>
            <h2>Buy a little, cook a lot</h2>
            <p className={styles.subtitle}>A few ingredients that unlock more recipes with what you already have.</p>
          </div>
          <button
            onClick={handleRefreshCombos}
            className="btn btn-ghost"
            disabled={loadingCombos}
            title="Get fresh ideas"
          >
            <Icon name="refresh" size={16} /> <span className={styles.toolLabel}>Refresh</span>
          </button>
        </div>
        {loadingCombos ? (
          <p className={styles.subtitle}>Finding ideas…</p>
        ) : ingredientCombos.length === 0 ? (
          <p className={styles.subtitle}>No ideas yet. Add more to your pantry and refresh.</p>
        ) : (
          <div className={styles.combosGrid}>
            {ingredientCombos.map((combo) => (
              <div key={combo.id} className={styles.comboCard}>
                <div className={styles.comboUnlock}>
                  Unlocks {combo.recipeCount} recipe{combo.recipeCount === 1 ? '' : 's'}
                </div>
                <div className={styles.comboIngredients}>
                  {combo.ingredients.map((ingredient, idx) => (
                    <span key={idx} className={styles.comboChip}>{ingredient.name}</span>
                  ))}
                </div>
                <p className={styles.comboRecipes}>
                  {combo.unlockedRecipes.map((r) => r.title).join(' · ')}
                </p>
                <button onClick={() => handleAddComboToList(combo)} className={styles.comboAdd}>
                  <Icon name="plus" size={14} strokeWidth={2.5} /> Add to list
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default GroceryList;
