// StationService — three independent stations with circuit breaker.
const STATION_IDS = ['ALPHA-01', 'BETA-02', 'GAMMA-03'];
const stations = new Map();
for (const id of STATION_IDS) {
  stations.set(id, {
    id, state: 'IDLE', startedAt: null, stoppedAt: null,
    sessionsRun: 0, sessionsFailed: 0, lastError: null,
    consecutiveFailures: 0, lastVerifiedAt: null, circuitOpenUntil: 0,
  });
}

export function listStations() { return Array.from(stations.values()).map(s => ({ ...s })); }

export function getStation(id) { return stations.get(id) || null; }

export function resetStation(id) {
  const s = stations.get(id);
  if (!s) throw Object.assign(new Error('Unknown station'), { status: 404 });
  s.state = 'IDLE'; s.startedAt = null; s.stoppedAt = null; s.lastError = null;
  s.consecutiveFailures = 0; s.circuitOpenUntil = 0;
  return { ...s };
}

export function resetStationIndependent(id) {
  const s = stations.get(id);
  if (!s) throw Object.assign(new Error('Unknown station'), { status: 404 });
  s.state = 'IDLE'; s.startedAt = null; s.stoppedAt = null; s.lastError = null;
  s.consecutiveFailures = 0; s.circuitOpenUntil = 0;
  s.sessionsRun = 0; s.sessionsFailed = 0; s.lastVerifiedAt = null;
  return { ...s, message: `${id} reset independently — other stations unaffected` };
}

export function stopAllStations() {
  for (const s of stations.values()) { s.state = 'STOPPED'; s.stoppedAt = new Date().toISOString(); }
  return listStations();
}

export function stationIds() { return [...STATION_IDS]; }
