import { expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';

export const PASSWORD = 'correct-horse-battery';

export function uniqueEmail(): string {
  return `e2e-${randomUUID().slice(0, 8)}@test.local`;
}

/** Sign up through the real form. Returns the email used. */
export async function signUpViaUi(page: Page, opts: { name?: string; inviteCode?: string } = {}): Promise<string> {
  const email = uniqueEmail();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await page.getByLabel('Your Name').fill(opts.name || 'E2E Cook');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  if (opts.inviteCode) {
    await page.getByLabel('Joining an existing household?').check();
    await page.getByPlaceholder('Household invite code').fill(opts.inviteCode);
  }
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'What are we cooking?' })).toBeVisible();
  return email;
}

/** Create a recipe through the Add Recipe form. */
export async function addRecipeViaUi(page: Page, name: string, ingredient: string) {
  await page.goto('/recipes/new');
  await page.getByLabel('Recipe Name *').fill(name);
  await page.getByPlaceholder('Ingredient name').first().fill(ingredient);
  await page.getByPlaceholder('Qty').first().fill('2');
  await page.getByPlaceholder('Step 1').fill('Mix everything together.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}
