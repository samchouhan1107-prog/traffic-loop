// Country definitions — server-authoritative, not frontend labels.
export const COUNTRIES = {
  US: { code: 'US', name: 'United States', continent: 'NA' },
  CA: { code: 'CA', name: 'Canada', continent: 'NA' },
  GB: { code: 'GB', name: 'United Kingdom', continent: 'EU' },
  DE: { code: 'DE', name: 'Germany', continent: 'EU' },
  FR: { code: 'FR', name: 'France', continent: 'EU' },
  NL: { code: 'NL', name: 'Netherlands', continent: 'EU' },
  IN: { code: 'IN', name: 'India', continent: 'APAC' },
  SG: { code: 'SG', name: 'Singapore', continent: 'APAC' },
  JP: { code: 'JP', name: 'Japan', continent: 'APAC' },
  AU: { code: 'AU', name: 'Australia', continent: 'APAC' },
  BR: { code: 'BR', name: 'Brazil', continent: 'SA' },
};
export function getCountry(code) { return COUNTRIES[code] || null; }
