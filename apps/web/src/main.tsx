import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { App } from './app/app';
import { ConfigErrorScreen } from './app/errors/config-error-screen';
import { configResult } from './lib/config';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    {configResult.ok ? <App /> : <ConfigErrorScreen issues={configResult.issues} />}
  </StrictMode>,
);
