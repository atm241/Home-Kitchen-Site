import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { recipesApi } from '../../services/api';
import { Recipe } from '../../types';
import sanitizeHtml from 'sanitize-html';
import styles from './Recipes.module.css';

const Recipes: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
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
      console.error('Error importing recipe:', error);
      showNotification('error', 'Failed to import recipe. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading recipes...</div>;
  }

  // Group recipes by category
  const groupedRecipes = recipes.reduce((acc, recipe) => {
    const category = recipe.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(recipe);
    return acc;
  }, {} as Record<string, Recipe[]>);

  // Get all categories for filter
  const categories = ['All', ...Object.keys(groupedRecipes).sort()];

  // Filter recipes based on selected category
  const filteredRecipes = selectedCategory === 'All'
    ? recipes
    : recipes.filter(recipe => (recipe.category || 'Uncategorized') === selectedCategory);

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

      {recipes.length > 0 && (
        <div className={styles.filterSection}>
          <label htmlFor="category-filter">Filter by Category:</label>
          <select
            id="category-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={styles.select}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.recipesGrid}>
        {recipes.length === 0 ? (
          <div className={styles.noRecipes}>
            <p>No recipes yet. Import one from a URL or add a custom recipe to get started!</p>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className={styles.noRecipes}>
            <p>No recipes in this category.</p>
          </div>
        ) : (
          filteredRecipes.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`} className={styles.recipeCard}>
              {recipe.category && (
                <div className={styles.categoryBadge}>{recipe.category}</div>
              )}
              <h3>{recipe.name}</h3>
              {recipe.description && (
                <p className={styles.description}>{recipe.description}</p>
              )}
              <div className={styles.recipeInfo}>
                <span>{recipe.servings} servings</span>
                {recipe.calories && <span>{recipe.calories} cal</span>}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Recipes;
