import axios from 'axios';

export interface BarcodeProduct {
  barcode: string;
  name: string;
  category: string;
  imageUrl: string | null;
}

const OFF_CATEGORY_MAP: { keyword: string; category: string }[] = [
  { keyword: 'fruits', category: 'Produce' },
  { keyword: 'vegetables', category: 'Produce' },
  { keyword: 'meats', category: 'Proteins' },
  { keyword: 'seafood', category: 'Proteins' },
  { keyword: 'poultry', category: 'Proteins' },
  { keyword: 'dairies', category: 'Dairy' },
  { keyword: 'milk', category: 'Dairy' },
  { keyword: 'cheese', category: 'Dairy' },
  { keyword: 'beverages', category: 'Beverages' },
  { keyword: 'snacks', category: 'Snacks' },
  { keyword: 'sauces', category: 'Condiments & Sauces' },
  { keyword: 'condiments', category: 'Condiments & Sauces' },
  { keyword: 'cereals', category: 'Grains & Pasta' },
  { keyword: 'pastas', category: 'Grains & Pasta' },
  { keyword: 'breads', category: 'Grains & Pasta' },
  { keyword: 'oils', category: 'Oils & Vinegars' },
  { keyword: 'vinegars', category: 'Oils & Vinegars' },
  { keyword: 'flours', category: 'Baking' },
  { keyword: 'baking', category: 'Baking' },
  { keyword: 'canned', category: 'Canned Goods' },
  { keyword: 'spices', category: 'Spices & Seasonings' },
  { keyword: 'herbs', category: 'Spices & Seasonings' },
];

const guessCategory = (offCategories: string): string => {
  const lower = offCategories.toLowerCase();
  for (const { keyword, category } of OFF_CATEGORY_MAP) {
    if (lower.includes(keyword)) return category;
  }
  return 'Other';
};

// Looks up a product by UPC/EAN barcode via the free, keyless Open Food Facts API.
export const lookupBarcode = async (barcode: string): Promise<BarcodeProduct | null> => {
  const sanitized = barcode.replace(/[^0-9]/g, '');
  if (!sanitized) return null;

  const response = await axios.get(
    `https://us.openfoodfacts.org/api/v2/product/${sanitized}.json`,
    { timeout: 5000, validateStatus: () => true }
  );

  if (response.data?.status !== 1 || !response.data.product) {
    return null;
  }

  const product = response.data.product;
  const name = product.product_name || product.generic_name || product.brands;
  if (!name) return null;

  return {
    barcode: sanitized,
    name,
    category: guessCategory(product.categories || ''),
    imageUrl: product.image_front_small_url || product.image_url || null,
  };
};
