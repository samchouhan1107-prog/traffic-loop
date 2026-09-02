// Station tests
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const stationService = await import('../server/services/stationService.js');

describe('Stations', () => {
  it('lists three stations', () => {
    const stations = stationService.listStations();
    assert.equal(stations.length, 3);
    assert.equal(stations[0].id, 'ALPHA-01');
    assert.equal(stations[1].id, 'BETA-02');
    assert.equal(stations[2].id, 'GAMMA-03');
  });

  it('reset station independently', () => {
    const s = stationService.resetStationIndependent('ALPHA-01');
    assert.equal(s.state, 'IDLE');
    assert.ok(s.message.includes('independently'));
  });

  it('stop all stations', () => {
    const result = stationService.stopAllStations();
    assert.equal(result.length, 3);
    assert.ok(result.every(s => s.state === 'STOPPED'));
  });

  it('unknown station throws', () => {
    assert.throws(() => stationService.resetStation('NOPE'), /Unknown station/);
  });
});
