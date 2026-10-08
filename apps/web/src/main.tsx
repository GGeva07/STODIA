import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/bold';
import '@phosphor-icons/web/fill';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadRuntimeConfig } from './lib/api';
import { initNative } from './lib/native';
import { SessionProvider } from './lib/session';

loadRuntimeConfig().then(() => {
  void initNative(() => ({ path: window.location.pathname, back: () => window.history.back() }));
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});
