import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installLinkInterceptor } from './lib/router';
import './styles/tokens.css';
import './styles/base.css';
import './styles/public.css';
import './styles/demo.css';
import './styles/admin.css';

installLinkInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
