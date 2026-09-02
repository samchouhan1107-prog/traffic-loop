// EgressProvider — REAL public IP + geolocation. Never fabricates.
let cachedEgress = null;
let cachedEgressAt = 0;
const EGRESS_TTL_MS = 5 * 60_000;

export const EgressProvider = Object.freeze({
  async detect() {
    const now = Date.now();
    if (cachedEgress && now - cachedEgressAt < EGRESS_TTL_MS) return cachedEgress;
    try {
      const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('ipify ' + r.status);
      const j = await r.json();
      cachedEgress = { ip: j.ip || null, error: null, at: now };
    } catch (e) {
      cachedEgress = { ip: null, error: String(e.message || e), at: now };
    }
    cachedEgressAt = now;
    return cachedEgress;
  },

  async geo(ip) {
    if (!ip) return { country: null, countryName: null, source: null, error: 'no_ip' };
    try {
      const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,query`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.status !== 'success') return { country: null, countryName: null, source: 'ip-api.com', error: String(j.message || j.status) };
      return { country: j.countryCode, countryName: j.country, source: 'ip-api.com', ip: j.query, error: null };
    } catch (e) {
      return { country: null, countryName: null, source: 'ip-api.com', error: String(e.message || e) };
    }
  },

  proxyUrlForCountry(_country) { return null; },
});
