import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { recipesApi } from '../../services/api';
import { Recipe, DIETARY_TAGS } from '../../types';
import styles from './Recipes.module.css';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#2ecc71',
  medium: '#E67E22',
  hard: '#e74c3c',
};

const Recipes: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedDietaryTags, setSelectedDietaryTags] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      const response = await recipesApi.getAll();
      setRecipes(response.data);
    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl) return;
    try {
      setImporting(true);
      await recipesApi.importFromUrl(importUrl);
      setImportUrl('');
      loadRecipes();
    } catch (error) {
      showNotification('error', 'Failed to import recipe. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, recipe: Recipe) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await recipesApi.toggleFavorite(recipe.id);
      setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, is_favorite: res.data.is_favorite } : r));
    } catch (error) {
      showNotification('error', 'Failed to update favorite');
    }
  };

  const toggleDietaryTag = (tag: string) => {
    setSelectedDietaryTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  if (loading) return <div className={styles.loading}>Loading recipes...</div>;

  const groupedRecipes = recipes.reduce((acc, recipe) => {
    const category = recipe.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(recipe);
    return acc;
  }, {} as Record<string, Recipe[]>);

  const categories = ['All', ...Object.keys(groupedRecipes).sort()];

  const filteredRecipes = recipes.filter(recipe => {
    const matchesCategory = selectedCategory === 'All' || (recipe.category || 'Uncategorized') === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || recipe.name.toLowerCase().includes(q) || (recipe.description?.toLowerCase().includes(q) ?? false);
    const matchesFavorites = !showFavoritesOnly || recipe.is_favorite;
    const matchesDietary = selectedDietaryTags.length === 0 ||
      selectedDietaryTags.every(tag => recipe.dietary_tags?.includes(tag));
    return matchesCategory && matchesSearch && matchesFavorites && matchesDietary;
  });

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}
      <div className={styles.header}>
        <h1>Recipes</h1>
        <Link to="/recipes/new" className={styles.addButton}>
          + Add Custom Recipe
        </Link>
      </div>

      <div className={styles.importSection}>
        <h2>Import Recipe from URL</h2>
        <form onSubmit={handleImport} className={styles.importForm}>
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="Enter recipe URL..."
            className={styles.input}
            disabled={importing}
          />
          <button type="submit" className={styles.button} disabled={importing}>
            {importing ? 'Importing...' : 'Import'}
          </button>
        </form>
      </div>

      <div className={styles.filterSection}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search recipes..."
          className={styles.searchInput}
        />
        {recipes.length > 0 && (
          <div className={styles.categoryFilter}>
            <label htmlFor="category-filter">Category:</label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={styles.select}
            >
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        )}
        <button
          className={`${styles.favoritesBtn} ${showFavoritesOnly ? styles.favoritesBtnActive : ''}`}
          onClick={() => setShowFavoritesOnly(prev => !prev)}
          title="Show favorites only"
        >
          {showFavoritesOnly ? '★ Favorites' : '☆ Favorites'}
        </button>
      </div>

      {DIETARY_TAGS.length > 0 && (
        <div className={styles.dietaryFilterSection}>
          <span className={styles.dietaryFilterLabel}>Dietary:</span>
          <div className={styles.dietaryChips}>
            {DIETARY_TAGS.map(tag => (
              <button
                key={tag}
                className={`${styles.dietaryChip} ${selectedDietaryTags.includes(tag) ? styles.dietaryChipActive : ''}`}
                onClick={() => toggleDietaryTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.recipesGrid}>
        {recipes.length === 0 ? (
          <div className={styles.noRecipes}>
            <p>No recipes yet. Import one from a URL or add a custom recipe to get started!</p>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className={styles.noRecipes}>
            <p>No recipes match your filters.</p>
          </div>
        ) : (
          filteredRecipes.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`} className={styles.recipeCard}>
              {recipe.image_url && (
                <div className={styles.cardImageWrap}>
                  <img src={recipe.image_url} alt={recipe.name} className={styles.cardImage} />
                </div>
              )}
              <div className={styles.cardBody}>
                <div className={styles.cardBadgeRow}>
                  {recipe.category && (
                    <span className={styles.categoryBadge}>{recipe.category}</span>
                  )}
                  {recipe.difficulty && (
                    <span
                      className={styles.difficultyBadge}
                      style={{ backgroundColor: DIFFICULTY_COLORS[recipe.difficulty] ?? '#999' }}
                    >
                      {recipe.difficulty}
                    </span>
                  )}
                  <button
                    className={`${styles.favoriteBtn} ${recipe.is_favorite ? styles.favoriteBtnActive : ''}`}
                    onClick={(e) => handleToggleFavorite(e, recipe)}
                    title={recipe.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {recipe.is_favorite ? '★' : '☆'}
                  </button>
                </div>
                <h3>{recipe.name}</h3>
                {recipe.description && (
                  <p className={styles.description}>{recipe.description}</p>
                )}
                {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
                  <div className={styles.cardDietaryTags}>
                    {recipe.dietary_tags.map(tag => (
                      <span key={tag} className={styles.cardDietaryTag}>{tag}</span>
                    ))}
                  </div>
                )}
                <div className={styles.recipeInfo}>
                  <span>{recipe.servings} servings</span>
                  {recipe.calories && <span>{recipe.calories} cal</span>}
                  {recipe.prep_time && <span>{recipe.prep_time + (recipe.cook_time || 0)} min</span>}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Recipes;
