import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import { BRAND_NAME } from './components/Brand/brand';

test('renders the login page for a signed-out visitor', async () => {
  render(<App />);
  // Use the brand constant so a rename doesn't break this test again.
  expect((await screen.findAllByText(new RegExp(BRAND_NAME, 'i'))).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
});
