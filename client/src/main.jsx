import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './components/AuthContext.jsx';
import './styles/global.css';

// GitHub Pages SPA fallback (project-site 404.html trick):
// 404.html redirects deep links like /traffic-loop/settings to
// /traffic-loop/?/settings. Before React mounts, we restore the
// real path so React Router sees /settings exactly as intended.
(function restoreSpaRoute() {
  const m = window.location.search.match(/^\?\/(.*)/);
  if (m) {
    window.history.replaceState(
      null,
      '',
      window.location.pathname.replace(/\/$/, '') + '/' + m[1] + window.location.hash
    );
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
