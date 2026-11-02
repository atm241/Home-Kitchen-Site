import React from 'react';
import { Link } from 'react-router-dom';
import { Recipe } from '../../types';
import { PantryCoverage } from '../../services/api';
import { resolveImageUrl } from '../../utils/imageUtils';
import Icon from '../Icon/Icon';
import { PLATFORM_LABEL, authorLabel, isVideoPlatform } from './sourceLabel';
import styles from './RecipeCard.module.css';

interface RecipeCardProps {
  recipe: Recipe;
  coverage?: PantryCoverage;
  onToggleFavorite?: (recipe: Recipe) => void;
}

// Warm placeholder tints for recipes without a photo, picked by id so a
// recipe always gets the same one.
const PLACEHOLDERS = ['#F5EAD3', '#EAF1E1', '#FCEBDD', '#F1ECE2'];

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, coverage, onToggleFavorite }) => {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  const author = authorLabel(recipe.source_platform, recipe.source_author);
  const hasPantryInfo = coverage && coverage.total > 0;
  const canMake = hasPantryInfo && coverage!.have === coverage!.total;

  return (
    <Link to={`/recipes/${recipe.id}`} className={styles.card}>
      <div
        className={styles.media}
        style={recipe.image_url ? undefined : { background: PLACEHOLDERS[recipe.id % PLACEHOLDERS.length] }}
      >
        {recipe.image_url ? (
          <img src={resolveImageUrl(recipe.image_url)} alt="" className={styles.image} loading="lazy" />
        ) : (
          <span className={styles.placeholderInitial}>{recipe.name.charAt(0)}</span>
        )}
        {isVideoPlatform(recipe.source_platform) && (
          <span className={styles.platformBadge}>
            <Icon name="play" size={10} filled strokeWidth={0} /> {PLATFORM_LABEL[recipe.source_platform!]}
          </span>
        )}
        {onToggleFavorite && (
          <button
            className={`${styles.favorite} ${recipe.is_favorite ? styles.favoriteOn : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(recipe);
            }}
            aria-label={recipe.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={!!recipe.is_favorite}
          >
            <Icon name="heart" size={18} filled={!!recipe.is_favorite} />
          </button>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{recipe.name}</h3>
        <div className={styles.meta}>
          {author && <span className={styles.author}>{author}</span>}
          {totalTime > 0 && (
            <span className={styles.metaItem}>
              <Icon name="clock" size={13} /> {totalTime} min
            </span>
          )}
        </div>
        {hasPantryInfo && (
          <div className={`${styles.pantry} ${canMake ? styles.pantryReady : ''}`}>
            {canMake ? 'You have everything' : `You have ${coverage!.have} of ${coverage!.total}`}
          </div>
        )}
      </div>
    </Link>
  );
};

export default RecipeCard;
