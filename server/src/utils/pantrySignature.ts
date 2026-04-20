import crypto from 'crypto';

export function createPantrySignature(ingredientNames: string[]): string {
  return crypto.createHash('md5').update(ingredientNames.sort().join(',')).digest('hex');
}
