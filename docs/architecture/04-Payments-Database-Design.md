# Payments Database Design

**Status:** DRAFT
**Phase:** Phase 2 - Core Platform
**Domain:** Payments

## 1. Database Goals

The Payments database must provide:

- One financial source of truth per payment.
- Strict payment state transitions.
- Exact monetary representation.
- Safe concurrent financial operations.
- Persistent idempotency.
- Webhook deduplication.
- Provider reference tracking.
- Auditability.
- Clear ownership through Mission.

## 2. Core Models

The MVP database should contain:

- Payment
- PaymentIdempotency
- PaymentWebhookEvent

## 3. Payment Model

Conceptual fields:

- id
- missionId
- customerId
- amount
- currency
- status
%
- provider
- providerPaymentId
- createdAt
- updatedAt

## 4. Payment Status

States: CREATED, AUTHORIZED, CAPTURED, REFUNDED, FAILED, CANCELLED

Valid transitions:

`created -> authorized
created -> failed
created -> cancelled
authorized -> captured
authorized -> cancelled
captured -> refunded`

## 5. Mission Relationship

Payment references exactly one Mission. Financial records must not be cascade-deleted when a mission is cancelled.

## 6. Customer Ownership
Payment stores customerId for authorization. The service must verify Payment.customerId = Mission.customerId.

## 7. Monetary Representation

Persisted monetary values must use Prisma Decimal. Do not use Float or Double for financial storage. Currency must be stored explicitly.

## 8. Payment Provider Data

Recommended fields:

- provider
- providerPaymentId

Do not store card numbers, CVV, provider credentials, or payment secrets.

## 9. Payment Idempotency

Require a persistent idempotency record for externally triggered financial mutations.

Recommended uniqueness:
`(userId, key, operation)`

A concurrent duplicate operation must not execute the financial effect twice.

## 10. Webhook Events

The database must store provider event IDs and prevent duplicate processing.

Recommended uniqueness:
`(provider, providerEventId)`

## 11. Indexes

Payment: index missionId, customerId, status, createdAt. Provider reference should be unique where applicable.

Idempotency: index paymentId, status, createdAt; impose uniqueness on userId, key, operation.

Webhook: index paymentId, status, receivedAt; unique provider + providerEventId.

## 12. Concurrency Protection

Financial state transitions must use conditional database updates or transactions. Application-level checks alone are not sufficient.

## 13. Refund Policy

This MVP supports full: `CAPTURED -> REFUNDED`. Partial refunds and multiple refunds require a dedicated PaymentRefund model later.

## 14. Deletion Policy

Financial records should not be cascade-deleted with Missions. Cancellation of a Mission must preserve Payment history.

## 15. Schema Integration Note

The current Mission model does not contain an approved pricing or quote field. A client-supplied amount must not automatically become the authoritative financial amount. A trusted server-side pricing or quote source is required.

## 16. Migration Strategy

Create a dedicated Prisma migration for Payments without destructive modification of existing Mission data.

## 17. Database Design Gate

Before implementation verify:

- Exact monetary representation.
- Mission ownership.
- Idempotency uniqueness.
- Webhook deduplication.
- Concurrency safety.
- Financial record retention.
- Client amounts are not blindly trusted.
- Prisma compatibility.

## 18. Open Product Decisions

- Payment provider - Supported currency - Payment method - Pricing/quote ownership - Partial refunds - Refund policy - Fees - Taxes - Runner payouts - Ledger - Chargebacks/disputes.
