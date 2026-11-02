import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* BASE_URL is '/' locally and '/taximate/' on GitHub Pages (set by VITE_BASE at build time). */}
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
