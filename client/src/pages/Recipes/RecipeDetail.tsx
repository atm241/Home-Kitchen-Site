import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { recipesApi, pantryApi, groceryApi, cookHistoryApi, PantryCoverage } from '../../services/api';
import Icon from '../../components/Icon/Icon';
import { PLATFORM_LABEL, authorLabel, isVideoPlatform } from '../../components/RecipeCard/sourceLabel';
import { Recipe } from '../../types';
import { DIETARY_TAGS } from '../../types';
import { getWeekStartDate } from '../../utils/dateUtils';
import { prepareImage, resolveImageUrl } from '../../utils/imageUtils';
import styles from './RecipeDetail.module.css';

const CATEGORIES = [
  'Breakfast', 'Lunch', 'Dinner', 'Appetizers & Snacks', 'Sides',
  'Salads', 'Soups & Stews', 'Sauces & Condiments', 'Desserts',
  'Beverages', 'Baking & Breads',
];


const RecipeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const importState = location.state as { justImported?: boolean; duplicate?: boolean } | null;
  const [showImportBanner, setShowImportBanner] = useState(!!importState?.justImported);
  const [coverage, setCoverage] = useState<PantryCoverage | null>(null);
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
  const [cookPlan, setCookPlan] = useState<Array<{
    pantryId: number;
    name: string;
    pantryQty: number;
    pantryUnit: string | null;
    pantryIsStaple: boolean;
    useQty: number;
    recipeUnit: string | null;
    deduct: string;
    include: boolean;
  }> | null>(null);
  const [applyingCook, setApplyingCook] = useState(false);
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  const handleEditPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setUploadingEditPhoto(true);
      const prepared = await prepareImage(file);
      const response = await recipesApi.uploadImage({
        image: prepared.base64,
        mediaType: prepared.mediaType,
      });
      setEditForm(prev => ({ ...prev, image_url: response.data.url }));
      showNotification('success', 'Photo uploaded!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      showNotification('error', 'Failed to upload photo');
    } finally {
      setUploadingEditPhoto(false);
    }
  };

  useEffect(() => {
    if (id) loadRecipe(parseInt(id));
  }, [id]);

  const loadRecipe = async (recipeId: number) => {
    try {
      const response = await recipesApi.getOne(recipeId);
      setRecipe(response.data);
      setScaledServings(response.data.servings);
      recipesApi.pantryMatch()
        .then(r => setCoverage(r.data[recipeId] || null))
        .catch(() => {});
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
      navigate('/');
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
      const cookScale = servings / (recipe.servings || 1);

      // Recipe ingredients rarely share an id with pantry items (imports
      // create their own ingredient rows), so fall back to name matching:
      // exact first, then containment ("Black Beans" ⊂ "can black beans").
      const norm = (s: string) => s.toLowerCase().trim();
      const findPantryMatch = (ing: { ingredient_id?: number; name: string }) =>
        pantryItems.find(p => p.ingredient_id === ing.ingredient_id) ||
        pantryItems.find(p => norm(p.ingredient_name) === norm(ing.name)) ||
        pantryItems.find(p => {
          const pn = norm(p.ingredient_name);
          const rn = norm(ing.name);
          return pn.length > 2 && rn.length > 2 && (rn.includes(pn) || pn.includes(rn));
        });

      const matchedPantryIds = new Set<number>();
      const plan = (recipe.ingredients || [])
        .filter(ing => ing.quantity)
        .map(ing => {
          const pantryItem = findPantryMatch(ing);
          if (!pantryItem || matchedPantryIds.has(pantryItem.id)) return null;
          matchedPantryIds.add(pantryItem.id);
          const useQty = Math.round(ing.quantity! * cookScale * 100) / 100;
          return {
            pantryId: pantryItem.id,
            name: ing.name,
            pantryQty: pantryItem.quantity || 0,
            pantryUnit: pantryItem.unit || null,
            pantryIsStaple: pantryItem.is_staple || false,
            useQty,
            recipeUnit: ing.unit || null,
            deduct: String(Math.min(useQty, pantryItem.quantity || 0)),
            include: true,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (plan.length === 0) {
        // Nothing in the pantry matches this recipe — just log the cook
        await cookHistoryApi.log({ recipe_id: recipe.id, recipe_name: recipe.name, servings_cooked: servings });
        showNotification('success', 'Cook logged! No matching pantry items to deduct.');
        setServingsCooked('');
        return;
      }

      setCookPlan(plan);
    } catch (error) {
      console.error('Error preparing cook deduction:', error);
      showNotification('error', 'Failed to load pantry for deduction');
    }
  };

  const handleConfirmCook = async () => {
    if (!recipe || !cookPlan) return;
    const servings = parseFloat(servingsCooked);
    try {
      setApplyingCook(true);
      for (const row of cookPlan) {
        if (!row.include) continue;
        const deduct = parseFloat(row.deduct);
        if (isNaN(deduct) || deduct <= 0) continue;
        const newQuantity = row.pantryQty - deduct;
        if (newQuantity <= 0) {
          await pantryApi.remove(row.pantryId);
        } else {
          await pantryApi.update(row.pantryId, {
            quantity: newQuantity,
            unit: row.pantryUnit || undefined,
            is_staple: row.pantryIsStaple,
          });
        }
      }

      await cookHistoryApi.log({
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        servings_cooked: servings,
      });

      const deductedCount = cookPlan.filter(r => r.include && parseFloat(r.deduct) > 0).length;
      showNotification('success', `Recipe marked as cooked! ${deductedCount} pantry item${deductedCount === 1 ? '' : 's'} updated.`);
      setCookPlan(null);
      setServingsCooked('');
    } catch (error) {
      console.error('Error marking recipe as cooked:', error);
      showNotification('error', 'Failed to update pantry');
    } finally {
      setApplyingCook(false);
    }
  };

  const updateCookPlanRow = (index: number, changes: Partial<{ deduct: string; include: boolean }>) => {
    setCookPlan(prev => prev ? prev.map((row, i) => i === index ? { ...row, ...changes } : row) : prev);
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
    try {
      const weekStartDate = getWeekStartDate();
      await groceryApi.addFromRecipe({ recipe_id: recipe.id, week_start_date: weekStartDate, servings: recipe.servings });
      showNotification('success', 'All ingredients added to your grocery list');
    } catch (error) {
      showNotification('error', 'Failed to add ingredients to grocery list');
    }
  };

  const handleAddMissingToGrocery = async () => {
    if (!recipe || !coverage || coverage.missing.length === 0) return;
    try {
      await groceryApi.addFromRecipe({
        recipe_id: recipe.id,
        week_start_date: getWeekStartDate(),
        servings: recipe.servings,
        ingredient_names: coverage.missing,
      });
      showNotification('success', `Added ${coverage.missing.length} item${coverage.missing.length > 1 ? 's' : ''} to your grocery list`);
    } catch {
      showNotification('error', 'Failed to add to grocery list');
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
              <label>Recipe Photo</label>
              <div className={styles.imageUploadRow}>
                <input
                  ref={editPhotoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEditPhotoSelect}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className={styles.uploadPhotoButton}
                  onClick={() => editPhotoInputRef.current?.click()}
                  disabled={uploadingEditPhoto}
                >
                  {uploadingEditPhoto ? 'Uploading...' : 'Upload photo'}
                </button>
                <input type="url" value={editForm.image_url}
                  onChange={e => setEditForm({ ...editForm, image_url: e.target.value })}
                  className={styles.editInput} placeholder="...or paste an image URL" />
              </div>
              {editForm.image_url && (
                <img src={resolveImageUrl(editForm.image_url)} alt="Recipe preview" className={styles.editImagePreview} />
              )}
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

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  const author = authorLabel(recipe.source_platform, recipe.source_author);
  const platformName = recipe.source_platform ? PLATFORM_LABEL[recipe.source_platform] : undefined;
  const missingSet = new Set((coverage?.missing || []).map(n => n.toLowerCase()));
  const steps = (recipe.instructions || '').split('\n').map(s => s.trim()).filter(Boolean);
  const sourceHost = (() => {
    try { return recipe.source_url ? new URL(recipe.source_url).hostname.replace(/^www\./, '') : undefined; } catch { return undefined; }
  })();

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      <div className={`${styles.topBar} noPrint`}>
        <button onClick={() => navigate('/')} className="btn btn-ghost">
          <Icon name="chevronLeft" size={18} /> Cookbook
        </button>
        <div className={styles.topActions}>
          <button
            onClick={handleToggleFavorite}
            className={`${styles.iconButton} ${recipe.is_favorite ? styles.iconButtonOn : ''}`}
            aria-label={recipe.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={!!recipe.is_favorite}
          >
            <Icon name="heart" size={20} filled={!!recipe.is_favorite} />
          </button>
          <button onClick={handleStartEdit} className={styles.iconButton} aria-label="Edit recipe">
            <Icon name="edit" size={20} />
          </button>
          <button onClick={handlePrint} className={`${styles.iconButton} ${styles.hideOnPhone}`} aria-label="Print recipe">
            <Icon name="printer" size={20} />
          </button>
          <button onClick={handleDelete} className={`${styles.iconButton} ${styles.iconButtonDanger}`} aria-label="Delete recipe">
            <Icon name="trash" size={20} />
          </button>
        </div>
      </div>

      {showImportBanner && (
        <div className={`${styles.importBanner} noPrint`} role="status">
          <Icon name="check" size={18} />
          <span>{importState?.duplicate ? 'This one was already in your cookbook.' : 'Saved to your cookbook. Give it a quick look and fix anything that came through wrong.'}</span>
          <button onClick={() => setShowImportBanner(false)} aria-label="Dismiss" className={styles.bannerClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      <div className={styles.hero}>
        <div className={`${styles.heroMedia} ${recipe.image_url ? '' : styles.heroMediaEmpty}`}>
          {recipe.image_url ? (
            <img src={resolveImageUrl(recipe.image_url)} alt={recipe.name} className={styles.heroImage} />
          ) : (
            <div className={styles.heroPlaceholder}>{recipe.name.charAt(0)}</div>
          )}
        </div>

        <div className={styles.heroInfo}>
          {recipe.category && <span className={styles.eyebrow}>{recipe.category}</span>}
          <h1 className={styles.recipeTitle}>{recipe.name}</h1>

          {recipe.source_url && (
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className={`${styles.sourceLink} noPrint`}>
              {isVideoPlatform(recipe.source_platform) ? (
                <><span className={styles.playDot}><Icon name="play" size={10} filled strokeWidth={0} /></span> Watch on {platformName}</>
              ) : (
                <><Icon name="external" size={15} /> {author || sourceHost || 'Original recipe'}</>
              )}
              {isVideoPlatform(recipe.source_platform) && author && <span className={styles.sourceAuthor}>· {author}</span>}
            </a>
          )}

          {recipe.description && <p className={styles.description}>{recipe.description}</p>}

          <div className={styles.stats}>
            {totalTime > 0 && (
              <div className={styles.stat}>
                <span className={styles.statValue}>{totalTime} min</span>
                <span className={styles.statLabel}>
                  {recipe.prep_time && recipe.cook_time ? `${recipe.prep_time} prep · ${recipe.cook_time} cook` : 'Total'}
                </span>
              </div>
            )}
            <div className={styles.stat}>
              <span className={styles.statValue}>{recipe.servings}</span>
              <span className={styles.statLabel}>Servings</span>
            </div>
            {recipe.calories && (
              <div className={styles.stat}>
                <span className={styles.statValue}>{recipe.calories}</span>
                <span className={styles.statLabel}>Cal / serving</span>
              </div>
            )}
          </div>

          <div className={`${styles.heroActions} noPrint`}>
            {steps.length > 0 && (
              <Link to={`/recipes/${recipe.id}/cook`} className="btn btn-primary">
                <Icon name="play" size={14} filled strokeWidth={0} /> Start cooking
              </Link>
            )}
            <button onClick={handleAddToGroceryList} className="btn btn-secondary">
              <Icon name="cart" size={16} /> Add to grocery list
            </button>
          </div>

          {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
            <div className={styles.dietaryTagsRow}>
              {recipe.dietary_tags.map(tag => (
                <span key={tag} className={styles.dietaryTag}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {coverage && coverage.total > 0 && (
        <div className={`${styles.pantryCard} noPrint`}>
          <div className={styles.pantryMeter} aria-hidden="true">
            <div className={styles.pantryMeterFill} style={{ width: `${(coverage.have / coverage.total) * 100}%` }} />
          </div>
          <div className={styles.pantryText}>
            <strong>
              {coverage.missing.length === 0
                ? 'Your pantry has everything for this'
                : `You have ${coverage.have} of ${coverage.total} ingredients`}
            </strong>
            {coverage.missing.length > 0 && (
              <span className={styles.pantryMissing}>Missing: {coverage.missing.join(', ')}</span>
            )}
          </div>
          {coverage.missing.length > 0 && (
            <button onClick={handleAddMissingToGrocery} className="btn btn-secondary">
              Add {coverage.missing.length} to list
            </button>
          )}
        </div>
      )}

      <div className={styles.body}>
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <section className={styles.ingredientsCol}>
            <div className={styles.sectionHeader}>
              <h2>Ingredients</h2>
              <div className={`${styles.scalingControl} noPrint`}>
                <button
                  className={styles.stepper}
                  onClick={() => setScaledServings(Math.max(1, (Number(scaledServings) || recipe.servings) - 1))}
                  aria-label="Fewer servings"
                >−</button>
                <span className={styles.scaleValue}>{scaledServings || recipe.servings} servings</span>
                <button
                  className={styles.stepper}
                  onClick={() => setScaledServings((Number(scaledServings) || recipe.servings) + 1)}
                  aria-label="More servings"
                >+</button>
              </div>
            </div>
            <ul className={styles.ingredientsList}>
              {recipe.ingredients.map((ing, index) => {
                const scaledQty = ing.quantity && scaleFactor !== 1
                  ? Math.round(ing.quantity * scaleFactor * 100) / 100
                  : ing.quantity;
                const have = coverage ? !missingSet.has(ing.name.toLowerCase()) : false;
                return (
                  <li key={index} className={have ? styles.haveIt : undefined}>
                    <span className={styles.ingQty}>{scaledQty ? `${scaledQty}${ing.unit ? ` ${ing.unit}` : ''}` : ''}</span>
                    <span className={styles.ingName}>
                      {ing.name}
                      {ing.notes && <span className={styles.ingNotes}>, {ing.notes}</span>}
                    </span>
                    {have && <span className={styles.haveBadge} title="In your pantry"><Icon name="check" size={14} strokeWidth={3} /></span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className={styles.mainCol}>
          {steps.length > 0 && (
            <section>
              <h2>Steps</h2>
              <ol className={styles.instructionsList}>
                {steps.map((step, index) => (
                  <li key={index}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {recipe.personal_notes && (
            <section className={styles.notesSection}>
              <h2>My notes</h2>
              <p className={styles.notesText}>{recipe.personal_notes}</p>
            </section>
          )}

          {(recipe.protein || recipe.carbs || recipe.fat) && (
            <section className={styles.nutrition}>
              <h2>Nutrition per serving</h2>
              <div className={styles.nutritionGrid}>
                {recipe.calories && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.calories}</span><span className={styles.nutritionLabel}>Calories</span></div>}
                {recipe.protein && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.protein}g</span><span className={styles.nutritionLabel}>Protein</span></div>}
                {recipe.carbs && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.carbs}g</span><span className={styles.nutritionLabel}>Carbs</span></div>}
                {recipe.fat && <div className={styles.nutritionItem}><span className={styles.nutritionValue}>{recipe.fat}g</span><span className={styles.nutritionLabel}>Fat</span></div>}
              </div>
            </section>
          )}

          <section className={`${styles.cookSection} noPrint`}>
            <h2>Made it?</h2>
            <p>Log it to your cook history and take what you used out of the pantry.</p>
            <div className={styles.cookForm}>
              <input type="number" step="0.1" value={servingsCooked}
                onChange={(e) => setServingsCooked(e.target.value)}
                placeholder={`${recipe.servings || 1} servings`}
                className={styles.servingsInput}
                aria-label="Servings cooked" />
              <button onClick={handleMarkAsCooked} className="btn btn-secondary">Mark as cooked</button>
            </div>
          </section>
        </div>
      </div>

      {cookPlan && (
        <div className={styles.modal} onClick={() => setCookPlan(null)}>
          <div className={`${styles.modalContent} ${styles.cookModalContent}`} onClick={e => e.stopPropagation()}>
            <h2>Update Pantry</h2>
            <p className={styles.cookModalHint}>
              Here's what this cook will use. Adjust the amounts to match what you actually have left, or uncheck items you don't want deducted.
            </p>
            <div className={styles.cookModalRows}>
              {cookPlan.map((row, idx) => {
                const unitsDiffer = row.recipeUnit && row.pantryUnit &&
                  row.recipeUnit.toLowerCase() !== row.pantryUnit.toLowerCase();
                return (
                  <div key={row.pantryId} className={`${styles.cookModalRow} ${!row.include ? styles.cookModalRowExcluded : ''}`}>
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={e => updateCookPlanRow(idx, { include: e.target.checked })}
                    />
                    <div className={styles.cookModalRowInfo}>
                      <span className={styles.cookModalRowName}>{row.name}</span>
                      <span className={styles.cookModalRowDetail}>
                        Have: {row.pantryQty} {row.pantryUnit || ''} · Recipe uses: {row.useQty} {row.recipeUnit || ''}
                        {unitsDiffer && <span className={styles.cookModalUnitWarning}> ⚠️ units differ — check the amount</span>}
                      </span>
                    </div>
                    <div className={styles.cookModalDeduct}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.deduct}
                        disabled={!row.include}
                        onChange={e => updateCookPlanRow(idx, { deduct: e.target.value })}
                        className={styles.cookModalDeductInput}
                      />
                      <span className={styles.cookModalDeductUnit}>{row.pantryUnit || ''} used</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setCookPlan(null)} disabled={applyingCook}>
                Cancel
              </button>
              <button className={styles.saveButton} onClick={handleConfirmCook} disabled={applyingCook}>
                {applyingCook ? 'Updating...' : 'Confirm & Log Cook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeDetail;
