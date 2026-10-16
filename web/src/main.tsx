import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/dark.css';
import './styles/base.css';
import './styles/app.css';
import { AppRoot } from './ui/AppRoot';
import { registerShell } from './app/sw';

registerShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
