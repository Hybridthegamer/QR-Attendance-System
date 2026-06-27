import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Register Service Worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(reg => {
        console.log('Service Worker registered:', reg.scope);
        // Listen for sync completion messages
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data?.type === 'SYNC_COMPLETE') {
            window.dispatchEvent(new CustomEvent('attendance-synced', { detail: event.data }));
          }
        });
      })
      .catch(err => console.error('SW registration failed:', err));
  });
}
