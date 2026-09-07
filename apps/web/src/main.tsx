import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { HullPreview } from './preview/HullPreview';
import { PlayPreview } from './preview/PlayPreview';

const query = new URLSearchParams(window.location.search);
const hullPreview = query.get('hull');
const playPreview = query.get('play') === '1';
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {hullPreview ? (
        playPreview ? (
          <PlayPreview specName={hullPreview} />
        ) : (
          <HullPreview specName={hullPreview} />
        )
      ) : (
        <App />
      )}
    </React.StrictMode>
  );
}
