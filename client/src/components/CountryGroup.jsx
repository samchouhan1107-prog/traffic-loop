import React from 'react';

export default function CountryGroup({ groups, selected, onChange }) {
  return (
    <label>Country Group: <select value={selected} onChange={e => onChange(e.target.value)}>
      {groups.map(g => <option key={g.id} value={g.id}>{g.id} ({g.countries.join(', ')})</option>)}
    </select></label>
  );
}
