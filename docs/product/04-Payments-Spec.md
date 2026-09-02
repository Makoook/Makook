# Payments MVP Specification

**Status:** DRAFT  
**Phase:** Phase 2 - Core Platform  
**Product Area:** Payments

## 1. Purpose

Payments provides the financial layer required for Makook missions.

Payments owns payment intent, authorization, capture, refund state, and payment transaction records.

Mission remains the source of truth for mission identity and lifecycle.

Payments must not duplicate or own Mission status.

## 2. MVP Goals

The MVP payment layer must support:

- Creating a payment intent for a mission
- Associating payment with exactly one mission
- Tracking payment lifecycle
- Authorizing a payment
- Capturing an authorized payment
- Refunding a captured payment
- Preventing duplicate financial operations
- Maintaining an auditable transaction record

## 3. Explicitly Deferred

The following require separate specifications:

- Runner payouts
- Runner earnings
- Wallets
- Tips
- Coupons
- Taxes
- Multi-currency settlement
- Split payments
- Chargebacks/disputes workflow
- Subscription billing
- Bank transfers
- Payment-provider-specific implementation details

## 4. Ownership

| Concern | Owner |
|---|---|
| Mission identity | Mission Management |
| Mission lifecycle | Mission Management |
| Payment state | Payments |
| Payment provider integration | Payments |
| Transaction records | Payments |
| Refund state | Payments |
| Runner payout | Future Payments/Payouts |
| Customer-facing payment UI | Web/Mobile clients |

## 5. Payment Lifecycle

MVP lifecycle:

`CREATED → AUTHORIZED → CAPTURED`

Failure/cancellation paths:

`CREATED → FAILED`

`CREATED → CANCELLED`

`AUTHORIZED → CANCELLED`

`CAPTURED → REFUNDED`

Rules:

- Only valid server-side transitions are accepted.
- Captured payments are financially final except through refund flow.
- Refunded payments cannot be captured again.
- Failed payments cannot be captured.
- Cancelled payments cannot be captured.
- Invalid transitions must not mutate state.

## 6. Payment Ownership and Isolation

A payment must belong to exactly one Mission.

A payment request must never accept customerId or runnerId as authoritative financial ownership fields.

The authenticated user, Mission ownership, and payment record must be validated server-side.

Clients must never be trusted to provide:

- final payment status
- captured amount
- refunded amount
- provider transaction status
- runner payout amount

## 7. Amount Handling

Financial amounts must be stored using exact decimal representation.

The API must validate:

- amount is positive
- currency is supported
- amount cannot be negative
- provider-returned amount must be reconciled against the expected amount

Floating-point arithmetic must not be used for persisted monetary values.

## 8. Idempotency

All externally triggered financial mutations must be idempotent.

At minimum:

- Create payment intent
- Authorize payment
- Capture payment
- Refund payment

Repeated requests with the same idempotency key must not create duplicate financial effects.

Concurrent duplicate requests must resolve to one effective operation.

## 9. Security Requirements

Payments must require authenticated server-side authorization.

A customer may operate only on payments belonging to the customer's own mission.

A runner must not gain authority to capture, refund, or modify a customer's payment merely because the runner is assigned to the mission.

Administrative financial operations must use dedicated permissions.

Payment secrets and provider credentials must never be exposed to clients or written to logs.

## 10. Provider Abstraction

The MVP must use a provider abstraction so business logic does not depend directly on one payment provider.

Conceptually:

`Payments Domain → Payment Provider Adapter → External Provider`

Provider-specific details remain outside the core payment domain model.

## 11. Webhook Principle

Provider webhooks must be treated as untrusted external input.

Webhook processing must:

- authenticate/verify the provider request
- validate event structure
- be idempotent
- prevent duplicate state transitions
- reconcile provider state with the internal payment record
- never trust a client-submitted payment status

## 12. Auditability

Payment mutations must be traceable.

The system should preserve:

- payment identifier
- mission identifier
- requested amount
- currency
- current state
- provider reference
- timestamps
- idempotency key/reference where applicable
- failure reason where applicable

Sensitive payment credentials must not be persisted in application logs.

## 13. MVP Non-Goals

Payments MVP does not implement:

- payout to runners
- accounting ledger
- settlement reconciliation dashboard
- dispute resolution UI
- advanced fraud scoring
- multiple payment methods beyond the selected provider integration
- currency conversion

## 14. Approval Gate

Before implementation of additional payment capabilities, separately approve:

- Payment Provider
- Payment Method UX
- Refund Policy
- Runner Payout Model
- Fees/Commission Model
- Currency Policy
- Webhook Event Matrix
- Dispute/Chargeback Policy
- Financial Ledger Requirements
