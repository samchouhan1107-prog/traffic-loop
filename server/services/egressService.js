// EgressService — egress verification helpers for campaigns.
import { EgressProvider } from '../providers/egressProvider.js';

export async function verifyEgress() {
  const egress = await EgressProvider.detect();
  const geo = await EgressProvider.geo(egress.ip);
  return { egress, geo, isAvailable: Boolean(egress.ip), isMatch: (country) => geo.country === country };
}
