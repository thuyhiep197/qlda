import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './api';
import App from './App';
import './styles.css';

// Trang đang mở từ bản cũ, server vừa triển khai bản mới → tệp JS cũ không còn: tự tải lại trang (tối đa 1 lần/phút)
window.addEventListener('vite:preloadError', (e) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem('chunk-reload') || 0); } catch { /* bỏ qua */ }
  if (Date.now() - last < 60_000) return;
  try { sessionStorage.setItem('chunk-reload', String(Date.now())); } catch { /* bỏ qua */ }
  e.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
