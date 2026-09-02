// GA4 measurement — honest, standards-based gtag integration.
//
// Principles enforced here:
// - Loads gtag.js ONLY if a real measurement ID is provided at build time
//   (VITE_GA4_MEASUREMENT_ID). No ID = no tracking, no fabricated data.
// - One page_view per real React Router navigation (the initial load's
//   page_view comes from gtag config itself).
// - Engagement time is NEVER fabricated. We rely on GA4's built-in
//   engagement tracking, and emit a visibility-derived engagement event
//   only while the tab is actually visible (Page Visibility API).
//   Hidden tabs contribute nothing.
// - We never send events on behalf of automated HTTP probes.

const MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || '';

export const ga4Enabled = Boolean(
  MEASUREMENT_ID && /^G-[A-Z0-9]{8,12}$/.test(MEASUREMENT_ID)
);

// Visible-time accumulator (Page Visibility API)
let visibleSince = null;
let visibleMsTotal = 0;
let visibilityBound = false;

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    visibleSince = Date.now();
  } else if (visibleSince !== null) {
    visibleMsTotal += Date.now() - visibleSince;
    visibleSince = null;
  }
}

export function bindVisibilityTracking() {
  if (visibilityBound || !ga4Enabled) return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', () => {
    // Flush only genuinely-visible time. Nothing is invented on unload.
    if (visibleSince !== null) {
      visibleMsTotal += Date.now() - visibleSince;
      visibleSince = null;
    }
    flushVisibleEngagement();
  });
}

// Load gtag.js once with the configured measurement ID.
export function initGa4() {
  if (!ga4Enabled || window.__tlGa4Loaded) return;
  window.__tlGa4Loaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // GA4 fires the initial page_view automatically with config.
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: true, // keep the automatic initial page_view
  });

  bindVisibilityTracking();
}

// Fire page_view once per client-side React Router navigation.
export function trackPageView(path) {
  if (!ga4Enabled || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_location: window.location.origin + path,
    page_path: path,
    page_title: document.title,
  });
}

// Send visible-engagement event — only genuinely observed visible time.
export function flushVisibleEngagement() {
  if (!ga4Enabled || !window.gtag) return;
  if (visibleSince !== null) {
    visibleMsTotal += Date.now() - visibleSince;
    visibleSince = null;
  }
  if (visibleMsTotal > 0) {
    window.gtag('event', 'visible_engagement', {
      visible_ms: visibleMsTotal,
    });
  }
}

// Track real user interactions only (clicks, form submissions, selections).
// NEVER called for HTTP probe results or automated activity.
export function trackEvent(name, params = {}) {
  if (!ga4Enabled || !window.gtag) return;
  window.gtag('event', name, params);
}
