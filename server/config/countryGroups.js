// Country groups — server-configurable, not hardcoded in frontend.
import { COUNTRIES } from './countries.js';

export const COUNTRY_GROUPS = Object.freeze({
  'GROUP-US': ['US'],
  'GROUP-EU': ['DE', 'GB', 'FR', 'NL'],
  'GROUP-APAC': ['IN', 'SG', 'JP', 'AU'],
  'GROUP-NORTH-AMERICA': ['US', 'CA'],
  'GROUP-GLOBAL': Object.keys(COUNTRIES),
});

export function listGroups() {
  return Object.entries(COUNTRY_GROUPS).map(([id, codes]) => ({
    id, countries: codes,
    names: codes.reduce((o, c) => { o[c] = COUNTRIES[c]?.name || c; return o; }, {}),
  }));
}

export function resolveGroup(groupId) {
  const g = COUNTRY_GROUPS[groupId];
  if (!g) throw Object.assign(new Error('Unknown country group: ' + groupId), { status: 400 });
  return [...g];
}
