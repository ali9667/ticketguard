import { randomUUID } from 'node:crypto';

export type PaymentResult = {
  status: 'SUCCEEDED' | 'FAILED';
  providerRef: string;
};

/**
 * Development-safe payment boundary. The domain is intentionally provider-agnostic
 * so a real Razorpay/Stripe adapter can be introduced without changing orders.
 */
export interface PaymentProvider {
  charge(input: { orderId: string; amount: string; currency: string }): Promise<PaymentResult>;
}

export class SandboxPaymentProvider implements PaymentProvider {
  async charge(input: { orderId: string; amount: string; currency: string }): Promise<PaymentResult> {
    void input;
    return { status: 'SUCCEEDED', providerRef: `sandbox_${randomUUID()}` };
  }
}

export const paymentProvider: PaymentProvider = new SandboxPaymentProvider();
