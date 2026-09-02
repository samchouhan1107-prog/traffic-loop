// PaymentProvider — honest provider status.
import { config } from '../config/environment.js';

export const PaymentProvider = Object.freeze({
  providers() {
    return {
      upi: { configured: Boolean(config.payment.upi.url && config.payment.upi.key), name: 'UPI gateway' },
      paypal: { configured: Boolean(config.payment.paypal.clientId && config.payment.paypal.clientSecret), name: 'PayPal' },
    };
  },
  status() {
    const p = this.providers();
    return { upi: p.upi.configured ? 'AVAILABLE' : 'UPI NOT CONFIGURED', paypal: p.paypal.configured ? 'AVAILABLE' : 'PAYPAL NOT CONFIGURED' };
  },
});
