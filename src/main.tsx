import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import DataVaultWebsite from './components/DataVaultWebsite.tsx';
import DataVaultDesigner from './components/DataVaultDesigner.tsx';
import ServerDashboard from './components/ServerDashboard.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
// 화면별 디자인 덮어쓰기 파일(src/ui-design). 기본 스타일보다 나중에 불러와야 우선 적용됩니다.
import './ui-design/index.css';
import { startLocalization } from './lib/localization';

// Global error and unhandled Promise rejection listeners to prevent app crashes
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const errorMsg = event.reason?.message || String(event.reason || '');
    console.warn('[Global Unhandled Rejection Caught]:', errorMsg);
    
    // Check if it's related to WebSocket, HMR, or network aborts/timeouts to silently warn-log instead of crashing
    if (
      errorMsg.includes('WebSocket') || 
      errorMsg.includes('HMR') || 
      errorMsg.includes('WS') ||
      errorMsg.includes('Failed to fetch') ||
      errorMsg.includes('AbortError') ||
      errorMsg.includes('timeout')
    ) {
      event.preventDefault(); // Suppress standard browser overlay/crash
    }
  });

  window.addEventListener('error', (event) => {
    const errorMsg = event.message || '';
    console.warn('[Global Window Error Caught]:', errorMsg);
    if (
      errorMsg.includes('WebSocket') || 
      errorMsg.includes('HMR') || 
      errorMsg.includes('WS')
    ) {
      event.preventDefault(); // Suppress console noise and crash overlays
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {window.location.pathname === '/server-design' ? <ServerDashboard /> : window.location.pathname === '/server-design/edit' || window.location.pathname === '/data-vault-design' ? <DataVaultDesigner /> : window.location.pathname === '/data-vault' ? <DataVaultWebsite /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);

startLocalization();
if (import.meta.env.DEV) {
  void import('./ui-design/inspector').then(({ startUiInspector }) => startUiInspector());
}
