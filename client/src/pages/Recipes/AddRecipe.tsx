import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { recipesApi } from '../../services/api';
import { DIETARY_TAGS } from '../../types';
import { prepareImage } from '../../utils/imageUtils';
import styles from './AddRecipe.module.css';

interface IngredientInput {
  name: string;
  quantity: string;
  unit: string;
  notes: string;
}

const AddRecipe: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'Dinner',
    servings: '4',
    prep_time: '',
    cook_time: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    image_url: '',
    difficulty: 'medium',
  });

  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<IngredientInput[]>([
    { name: '', quantity: '', unit: 'cup', notes: '' }
  ]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsingPhoto, setParsingPhoto] = useState(false);
  const coverPhotoInputRef = useRef<HTMLInputElement>(null);
  const importPhotoInputRef = useRef<HTMLInputElement>(null);

  const handleCoverPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setUploadingImage(true);
      setError(null);
      const prepared = await prepareImage(file);
      const response = await recipesApi.uploadImage({
        image: prepared.base64,
        mediaType: prepared.mediaType,
      });
      setFormData(prev => ({ ...prev, image_url: response.data.url }));
      setImagePreview(prepared.dataUrl);
    } catch (err) {
      console.error('Error uploading photo:', err);
      setError('Failed to upload photo. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImportPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setParsingPhoto(true);
      setError(null);
      const prepared = await prepareImage(file, 2000);
      const response = await recipesApi.parsePhoto({
        image: prepared.base64,
        mediaType: prepared.mediaType,
      });
      const recipe = response.data;

      setFormData(prev => ({
        ...prev,
        name: recipe.name,
        description: recipe.description || '',
        category: recipe.category || prev.category,
        servings: recipe.servings ? String(recipe.servings) : prev.servings,
        prep_time: recipe.prep_time ? String(recipe.prep_time) : '',
        cook_time: recipe.cook_time ? String(recipe.cook_time) : '',
      }));
      if (recipe.ingredients.length > 0) {
        setIngredients(recipe.ingredients.map(ing => ({
          name: ing.name,
          quantity: ing.quantity != null ? String(ing.quantity) : '',
          unit: ing.unit || 'count',
          notes: ing.notes || '',
        })));
      }
      if (recipe.instructions) {
        const steps = recipe.instructions.split('\n').filter(s => s.trim());
        if (steps.length > 0) setInstructions(steps);
      }
    } catch (err: any) {
      console.error('Error importing recipe from photo:', err);
      setError(err.response?.data?.error || 'Could not read a recipe from that photo. Try a clearer shot.');
    } finally {
      setParsingPhoto(false);
    }
  };

  const toggleDietaryTag = (tag: string) => {
    setDietaryTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: '', unit: 'cup', notes: '' }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: keyof IngredientInput, value: string) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const handleAddStep = () => setInstructions([...instructions, '']);

  const handleRemoveStep = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, value: string) => {
    const updated = [...instructions];
    updated[index] = value;
    setInstructions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Please enter a recipe name');
      return;
    }
    setError(null);
    try {
      setSubmitting(true);

      const formattedIngredients = ingredients
        .filter(ing => ing.name.trim())
        .map(ing => ({
          name: ing.name.trim(),
          quantity: ing.quantity ? parseFloat(ing.quantity) : undefined,
          unit: ing.unit,
          notes: ing.notes.trim() || undefined,
        }));

      const formattedInstructions = instructions.filter(step => step.trim()).join('\n');

      const recipeData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category || undefined,
        servings: parseInt(formData.servings) || 4,
        prep_time: formData.prep_time ? parseInt(formData.prep_time) : undefined,
        cook_time: formData.cook_time ? parseInt(formData.cook_time) : undefined,
        instructions: formattedInstructions || undefined,
        calories: formData.calories ? parseInt(formData.calories) : undefined,
        protein: formData.protein ? parseFloat(formData.protein) : undefined,
        carbs: formData.carbs ? parseFloat(formData.carbs) : undefined,
        fat: formData.fat ? parseFloat(formData.fat) : undefined,
        image_url: formData.image_url.trim() || undefined,
        difficulty: formData.difficulty as any,
        dietary_tags: dietaryTags,
        ingredients: formattedIngredients,
      };

      const response = await recipesApi.create(recipeData);
      navigate(`/recipes/${response.data.id}`);
    } catch (error) {
      console.error('Error creating recipe:', error);
      setError('Failed to create recipe. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      {error && (
        <div className={styles.notification} style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>
          {error}
        </div>
      )}
      <div className={styles.header}>
        <button onClick={() => navigate('/')} className={styles.backButton}>
          ← Cookbook
        </button>
        <h1>Add a recipe</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Import from photo */}
        <div className={styles.photoImportBanner}>
          <div>
            <strong>Have a photo of this recipe?</strong>
            <p>Snap a cookbook page, recipe card, or screenshot and the form fills itself in for you to review.</p>
          </div>
          <input
            ref={importPhotoInputRef}
            type="file"
            accept="image/*"
            onChange={handleImportPhotoSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className={styles.photoImportButton}
            onClick={() => importPhotoInputRef.current?.click()}
            disabled={parsingPhoto}
          >
            {parsingPhoto ? 'Reading photo...' : 'Import from photo'}
          </button>
        </div>

        {/* Basic Info */}
        <div className={styles.section}>
          <h2>Basic Information</h2>
          <div className={styles.formGroup}>
            <label htmlFor="name">Recipe Name *</label>
            <input type="text" id="name" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Grandma's Chicken Soup" className={styles.input} required />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="description">Description</label>
            <textarea id="description" value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the recipe..." className={styles.textarea} rows={3} />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="image_url">Recipe Photo (optional)</label>
            <div className={styles.imageUploadRow}>
              <input
                ref={coverPhotoInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverPhotoSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.uploadPhotoButton}
                onClick={() => coverPhotoInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? 'Uploading...' : 'Upload photo'}
              </button>
              <input type="url" id="image_url" value={formData.image_url}
                onChange={(e) => { setFormData({ ...formData, image_url: e.target.value }); setImagePreview(null); }}
                placeholder="...or paste an image URL" className={styles.input} />
            </div>
            {(imagePreview || formData.image_url) && (
              <img
                src={imagePreview || formData.image_url}
                alt="Recipe preview"
                className={styles.imagePreview}
              />
            )}
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="category">Category</label>
              <select id="category" value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className={styles.select}>
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

            <div className={styles.formGroup}>
              <label htmlFor="difficulty">Difficulty</label>
              <select id="difficulty" value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                className={styles.select}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="servings">Servings</label>
              <input type="number" id="servings" value={formData.servings}
                onChange={(e) => setFormData({ ...formData, servings: e.target.value })}
                className={styles.input} min="1" />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="prep_time">Prep Time (min)</label>
              <input type="number" id="prep_time" value={formData.prep_time}
                onChange={(e) => setFormData({ ...formData, prep_time: e.target.value })}
                placeholder="30" className={styles.input} min="0" />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="cook_time">Cook Time (min)</label>
              <input type="number" id="cook_time" value={formData.cook_time}
                onChange={(e) => setFormData({ ...formData, cook_time: e.target.value })}
                placeholder="45" className={styles.input} min="0" />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Dietary Tags</label>
            <div className={styles.dietaryTagsGrid}>
              {DIETARY_TAGS.map(tag => (
                <button key={tag} type="button"
                  className={`${styles.dietaryTagBtn} ${dietaryTags.includes(tag) ? styles.dietaryTagBtnActive : ''}`}
                  onClick={() => toggleDietaryTag(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Ingredients</h2>
            <button type="button" onClick={handleAddIngredient} className={styles.addButton}>
              + Add Ingredient
            </button>
          </div>
          {ingredients.map((ingredient, index) => (
            <div key={index} className={styles.ingredientRow}>
              <div className={styles.ingredientInputs}>
                <input type="text" value={ingredient.name}
                  onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                  placeholder="Ingredient name" className={styles.input} />
                <input type="number" step="0.1" value={ingredient.quantity}
                  onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                  placeholder="Qty" className={styles.inputSmall} />
                <select value={ingredient.unit}
                  onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                  className={styles.select}>
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
                </select>
                <input type="text" value={ingredient.notes}
                  onChange={(e) => handleIngredientChange(index, 'notes', e.target.value)}
                  placeholder="Notes (optional)" className={styles.input} />
              </div>
              {ingredients.length > 1 && (
                <button type="button" onClick={() => handleRemoveIngredient(index)}
                  className={styles.removeButton} title="Remove ingredient">×</button>
              )}
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Instructions</h2>
            <button type="button" onClick={handleAddStep} className={styles.addButton}>+ Add Step</button>
          </div>
          {instructions.map((step, index) => (
            <div key={index} className={styles.stepRow}>
              <span className={styles.stepNumber}>{index + 1}.</span>
              <textarea value={step} onChange={(e) => handleStepChange(index, e.target.value)}
                placeholder={`Step ${index + 1}`} className={styles.textarea} rows={2} />
              {instructions.length > 1 && (
                <button type="button" onClick={() => handleRemoveStep(index)}
                  className={styles.removeButton} title="Remove step">×</button>
              )}
            </div>
          ))}
        </div>

        {/* Nutrition */}
        <div className={styles.section}>
          <h2>Nutrition (per serving) — Optional</h2>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="calories">Calories</label>
              <input type="number" id="calories" value={formData.calories}
                onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                placeholder="0" className={styles.input} min="0" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="protein">Protein (g)</label>
              <input type="number" step="0.1" id="protein" value={formData.protein}
                onChange={(e) => setFormData({ ...formData, protein: e.target.value })}
                placeholder="0" className={styles.input} min="0" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="carbs">Carbs (g)</label>
              <input type="number" step="0.1" id="carbs" value={formData.carbs}
                onChange={(e) => setFormData({ ...formData, carbs: e.target.value })}
                placeholder="0" className={styles.input} min="0" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="fat">Fat (g)</label>
              <input type="number" step="0.1" id="fat" value={formData.fat}
                onChange={(e) => setFormData({ ...formData, fat: e.target.value })}
                placeholder="0" className={styles.input} min="0" />
            </div>
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" onClick={() => navigate('/')} className={styles.cancelButton}>
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={submitting}>
            {submitting ? 'Creating Recipe...' : 'Create Recipe'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddRecipe;
