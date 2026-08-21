import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { notifyUpdateReady } from './utils/swUpdate';

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
//
// onUpdate is essential, not optional: without it a new build installs and then
// waits for every tab to close before activating, so a deploy would never reach
// anyone still using the app. This surfaces a banner instead.
serviceWorkerRegistration.register({ onUpdate: notifyUpdateReady });
