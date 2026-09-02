export function validateUrl(url) {
  if (typeof url !== 'string') throw Object.assign(new Error('URL required'), { status: 400 });
  if (!/^https?:\/\/[^\s]{1,512}$/i.test(url)) throw Object.assign(new Error('URL must start with http(s)://'), { status: 400 });
  try { const u = new URL(url); if (!['http:', 'https:'].includes(u.protocol)) throw new Error(); return u.toString(); }
  catch { throw Object.assign(new Error('URL is not parseable'), { status: 400 }); }
}

export function clampInt(n, min, max) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) throw Object.assign(new Error('Expected integer'), { status: 400 });
  return Math.max(min, Math.min(max, v));
}

export function clampStr(s, max) { return (typeof s === 'string' ? s.slice(0, max) : ''); }
