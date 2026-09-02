import { api } from './api';

export async function getDiagnostic(campaignId) { return api(`/api/campaigns/${campaignId}/diagnostic`); }
export async function getLiveStatus(campaignId) { return api(`/api/campaigns/${campaignId}/live`); }
export async function getReconciliation(campaignId) { return api(`/api/campaigns/${campaignId}/reconcile`); }
export async function getPipelineLog(campaignId) { return api(`/api/campaigns/${campaignId}/pipeline`); }
