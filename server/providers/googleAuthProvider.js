// Google OAuth provider — stub for production integration.
import { config } from '../config/environment.js';

export const GoogleAuthProvider = Object.freeze({
  isConfigured() { return Boolean(config.google.clientId && config.google.clientSecret); },
  getAuthUrl() {
    if (!this.isConfigured()) return null;
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.google.clientId}&redirect_uri=${config.baseUrl}/api/auth/google/callback&response_type=code&scope=openid email profile`;
  },
  async exchangeCode(code) {
    if (!this.isConfigured()) return { ok: false, reason: 'Google OAuth not configured' };
    return { ok: false, reason: 'Google OAuth not implemented yet' };
  },
});
