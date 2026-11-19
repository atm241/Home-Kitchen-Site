import { test, expect } from '@playwright/test';
import { signUpViaUi, addRecipeViaUi, PASSWORD } from './helpers';

test('a new account starts with an empty cookbook and a guide', async ({ page }) => {
  await signUpViaUi(page);
  await expect(page.getByRole('heading', { name: 'Your cookbook is empty' })).toBeVisible();
});

test('a recipe typed in by hand is saved and shows in the cookbook', async ({ page }) => {
  await signUpViaUi(page);
  await addRecipeViaUi(page, 'E2E Lemon Pasta', 'lemon');
  await expect(page.getByText('lemon', { exact: false }).first()).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('E2E Lemon Pasta')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('lemon');
  await expect(page.getByText('E2E Lemon Pasta')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('no-such-recipe');
  await expect(page.getByText('No recipes match.')).toBeVisible();
});

test('grocery items can be added and checked off', async ({ page }) => {
  await signUpViaUi(page);
  await page.goto('/grocery');
  await page.getByLabel('Item name').fill('oat milk');
  await page.getByLabel('Item name').press('Enter');
  const checkOff = page.getByRole('button', { name: 'Check off oat milk' });
  await expect(checkOff).toBeVisible();
  await checkOff.click();
  await expect(page.getByRole('button', { name: 'Uncheck oat milk' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Uncheck oat milk' })).toBeVisible();
});

test('logging out and back in keeps your data', async ({ page }) => {
  const email = await signUpViaUi(page);
  await addRecipeViaUi(page, 'E2E Keep Me', 'salt');

  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log In', exact: true }).last().click();
  await expect(page.getByText('E2E Keep Me')).toBeVisible();
});
