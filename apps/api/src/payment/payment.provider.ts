export interface PaymentProvider {
  createIntent(
    paymentId: string,
    amount: string,
    currency: string,
    operationKey: string,
  ): Promise<{ providerPaymentId: string }>;

  authorize(
    providerPaymentId: string,
    operationKey: string,
  ): Promise<void>;

  capture(
    providerPaymentId: string,
    operationKey: string,
  ): Promise<void>;

  refund(
    providerPaymentId: string,
    operationKey: string,
  ): Promise<void>;
}

export class DevelopmentPaymentProvider
  implements PaymentProvider
{
  async createIntent(
    paymentId: string,
    _amount: string,
    _currency: string,
    _operationKey: string,
  ): Promise<{ providerPaymentId: string }> {
    return {
      providerPaymentId: `dev_${paymentId}`,
    };
  }

  async authorize(
    _providerPaymentId: string,
    _operationKey: string,
  ): Promise<void> {}

  async capture(
    _providerPaymentId: string,
    _operationKey: string,
  ): Promise<void> {}

  async refund(
    _providerPaymentId: string,
    _operationKey: string,
  ): Promise<void> {}
}
