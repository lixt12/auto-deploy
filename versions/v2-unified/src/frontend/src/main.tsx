import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import './index.css';
import App from './App';

// Normalize /api requests across Vite dev server and Electron file:// runtime.
const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const apiBaseFromEnv = (import.meta as any)?.env?.VITE_API_BASE_URL || '';
  const electronFallbackBase = window.location.protocol === 'file:' ? 'http://127.0.0.1:8088' : '';
  const apiBase = apiBaseFromEnv || electronFallbackBase;

  if (typeof input === 'string' && input.startsWith('/api') && apiBase) {
    return originalFetch(`${apiBase}${input}`, init);
  }

  if (input instanceof URL && input.pathname.startsWith('/api') && apiBase) {
    return originalFetch(new URL(`${apiBase}${input.pathname}${input.search}`), init);
  }

  return originalFetch(input, init);
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const isFileProtocol = window.location.protocol === 'file:';
const Router = isFileProtocol ? HashRouter : BrowserRouter;

root.render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
