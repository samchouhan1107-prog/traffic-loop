// Payment routes — provider-agnostic payment endpoints.
import { PaymentProvider } from '../providers/paymentProvider.js';

export function paymentRoutes(route) {
  route('GET', '/api/payments/status', (ctx) => {
    ctx.json(200, { providers: PaymentProvider.providers(), status: PaymentProvider.status() });
  });
}
