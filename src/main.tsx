import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

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
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
