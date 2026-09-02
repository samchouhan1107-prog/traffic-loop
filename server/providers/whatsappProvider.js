// WhatsApp OTP Provider — stub for production integration.
import { config } from '../config/environment.js';

export const WhatsAppProvider = Object.freeze({
  isConfigured() { return Boolean(config.whatsapp.apiKey); },
  async sendOtp(phone, code) {
    if (!this.isConfigured()) return { sent: false, reason: 'WHATSAPP_API_KEY not configured' };
    console.log(`[whatsapp-stub] OTP ${code} for ${phone}`);
    return { sent: true, method: 'stub' };
  },
});
