import { test, expect } from '@playwright/test';
import { signUpViaUi, addRecipeViaUi } from './helpers';

test('a member who joins with the invite code sees the shared cookbook; a stranger does not', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await signUpViaUi(owner, { name: 'Owner' });
  await addRecipeViaUi(owner, 'E2E Family Chili', 'beans');

  await owner.goto('/');
  await owner.getByRole('button', { name: 'Account' }).click();
  const inviteCode = (await owner.locator('code').first().textContent())?.trim();
  expect(inviteCode).toBeTruthy();

  const member = await (await browser.newContext()).newPage();
  await signUpViaUi(member, { name: 'Member', inviteCode: inviteCode! });
  await expect(member.getByText('E2E Family Chili')).toBeVisible();

  const stranger = await (await browser.newContext()).newPage();
  await signUpViaUi(stranger, { name: 'Stranger' });
  await expect(stranger.getByRole('heading', { name: 'Your cookbook is empty' })).toBeVisible();
  await expect(stranger.getByText('E2E Family Chili')).toHaveCount(0);
});
