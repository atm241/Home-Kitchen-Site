import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { recipesApi, PantryCoverage } from '../../services/api';
import { Recipe } from '../../types';
import { useAuth } from '../../context/AuthContext';
import ImportBar from '../../components/ImportBar/ImportBar';
import RecipeCard from '../../components/RecipeCard/RecipeCard';
import { isVideoPlatform } from '../../components/RecipeCard/sourceLabel';
import Icon from '../../components/Icon/Icon';
import styles from './Cookbook.module.css';

type QuickFilter = 'all' | 'favorites' | 'pantry' | 'quick' | 'videos';

const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pantry', label: 'Make with what I have' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'quick', label: 'Under 30 min' },
  { id: 'videos', label: 'From videos' },
];

// "Make with what I have" allows a couple of gaps, since almost nobody has
// every last garnish on hand.
const MAX_MISSING_FOR_PANTRY = 2;

const Cookbook: React.FC = () => {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [coverage, setCoverage] = useState<Record<number, PantryCoverage>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  // ?filter=pantry (linked from the Pantry page) opens with that filter on.
  const [params] = useSearchParams();
  const [quick, setQuick] = useState<QuickFilter>(
    QUICK_FILTERS.some(f => f.id === params.get('filter')) ? (params.get('filter') as QuickFilter) : 'all'
  );
  const [category, setCategory] = useState<string | null>(null);

  const load = async () => {
    setLoadError(false);
    try {
      const response = await recipesApi.getAll();
      setRecipes(response.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    // Pantry info is a bonus; the cookbook works without it.
    recipesApi.pantryMatch().then(r => setCoverage(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const toggleFavorite = async (recipe: Recipe) => {
    // Optimistic: flip now, undo if the server says no.
    setRecipes(prev => prev.map(r => (r.id === recipe.id ? { ...r, is_favorite: !r.is_favorite } : r)));
    try {
      await recipesApi.toggleFavorite(recipe.id);
    } catch {
      setRecipes(prev => prev.map(r => (r.id === recipe.id ? { ...r, is_favorite: recipe.is_favorite } : r)));
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(recipes.map(r => r.category).filter(Boolean) as string[])).sort(),
    [recipes]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = recipes.filter(r => {
      if (category && r.category !== category) return false;
      if (q) {
        const haystack = [r.name, r.description, r.source_author, ...(r.ingredients || []).map(i => i.name)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const c = coverage[r.id];
      switch (quick) {
        case 'favorites': return !!r.is_favorite;
        case 'quick': {
          const t = (r.prep_time || 0) + (r.cook_time || 0);
          return t > 0 && t <= 30;
        }
        case 'videos': return isVideoPlatform(r.source_platform);
        case 'pantry': return !!c && c.total > 0 && c.total - c.have <= MAX_MISSING_FOR_PANTRY;
        default: return true;
      }
    });
    if (quick === 'pantry') {
      list = [...list].sort((a, b) => {
        const ma = coverage[a.id].total - coverage[a.id].have;
        const mb = coverage[b.id].total - coverage[b.id].have;
        return ma - mb;
      });
    }
    return list;
  }, [recipes, coverage, query, quick, category]);

  const firstName = user?.name?.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</p>
        <h1 className={styles.title}>What are we cooking?</h1>
        <ImportBar size="large" />
        <div className={styles.heroLinks}>
          <Link to="/recipes/new" className={styles.heroLink}>
            <Icon name="camera" size={16} /> Snap a cookbook page or type one in
          </Link>
          <Link to="/settings/share" className={styles.heroLink}>
            <Icon name="share" size={16} /> Save from your phone's share menu
          </Link>
        </div>
      </section>

      {loading ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      ) : loadError ? (
        <div className={styles.empty}>
          <p>Couldn't load your cookbook.</p>
          <button className="btn btn-secondary" onClick={load}>Try again</button>
        </div>
      ) : recipes.length === 0 ? (
        <div className={styles.onboarding}>
          <h2>Your cookbook is empty</h2>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNum}>1</span>
              <div>
                <strong>Find a recipe you like</strong>
                <p>A TikTok, a YouTube Short, a Reel, or any recipe website.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNum}>2</span>
              <div>
                <strong>Copy the link and paste it above</strong>
                <p>Or <Link to="/settings/share">set up your phone</Link> to save straight from the share menu.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNum}>3</span>
              <div>
                <strong>Get a clean recipe</strong>
                <p>Ingredients, steps and times, pulled from the creator's caption.</p>
              </div>
            </li>
          </ol>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <Icon name="search" size={18} className={styles.searchIcon} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${recipes.length} recipes or ingredients`}
                className={styles.search}
                aria-label="Search recipes"
              />
            </div>
            <div className={styles.chips} role="group" aria-label="Filters">
              {QUICK_FILTERS.map(f => (
                <button
                  key={f.id}
                  className={`chip ${quick === f.id ? 'chip-active' : ''}`}
                  onClick={() => setQuick(f.id)}
                  aria-pressed={quick === f.id}
                >
                  {f.label}
                </button>
              ))}
              {categories.length > 1 && <span className={styles.chipDivider} aria-hidden="true" />}
              {categories.length > 1 && categories.map(c => (
                <button
                  key={c}
                  className={`chip ${category === c ? 'chip-active' : ''}`}
                  onClick={() => setCategory(category === c ? null : c)}
                  aria-pressed={category === c}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className={styles.empty}>
              <p>
                {quick === 'pantry'
                  ? 'Nothing you can make with your pantry yet. Add what you have on the Pantry tab.'
                  : 'No recipes match.'}
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => { setQuery(''); setQuick('all'); setCategory(null); }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className={styles.grid}>
              {visible.map(r => (
                <RecipeCard key={r.id} recipe={r} coverage={coverage[r.id]} onToggleFavorite={toggleFavorite} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Cookbook;
