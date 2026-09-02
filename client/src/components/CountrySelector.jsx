import React from 'react';

export default function CountrySelector({ countries, selected, onChange }) {
  return (
    <label>Country: <select value={selected} onChange={e => onChange(e.target.value)}>
      {countries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
    </select></label>
  );
}
