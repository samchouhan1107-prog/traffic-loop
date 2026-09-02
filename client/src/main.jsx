import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './components/AuthContext.jsx';
import { initGa4, trackPageView, ga4Enabled } from './services/ga4.js';
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

// One page_view per React Router navigation. The initial load's
// page_view is fired automatically by gtag('config'), so we skip the
// first render to avoid counting it twice.
function RouteTracker() {
  const location = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    trackPageView(location.pathname + location.search);
  }, [location]);
  return null;
}

initGa4();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {ga4Enabled && <RouteTracker />}
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
