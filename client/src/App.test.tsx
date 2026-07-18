import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the login page for a signed-out visitor', async () => {
  render(<App />);
  const heading = await screen.findByText(/home kitchen/i);
  expect(heading).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
});
