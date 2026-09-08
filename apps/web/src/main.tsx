import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { HarborApp } from './harbor/HarborApp';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <HarborApp />
    </React.StrictMode>
  );
}
