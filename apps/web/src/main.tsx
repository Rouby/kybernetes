import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { HullPreview } from './preview/HullPreview';

const hullPreview = new URLSearchParams(window.location.search).get('hull');
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {hullPreview ? <HullPreview specName={hullPreview} /> : <App />}
    </React.StrictMode>
  );
}
