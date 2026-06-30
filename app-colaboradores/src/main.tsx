import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Marcar como aplicativo móvel
(window as any).__MOBILE_APP__ = true;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
