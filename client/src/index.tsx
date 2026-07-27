import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registered (instead of CRA's default unregister()) so the app installs as a
// home-screen PWA and the shell keeps working on a flaky self-hosted connection.
serviceWorkerRegistration.register();
