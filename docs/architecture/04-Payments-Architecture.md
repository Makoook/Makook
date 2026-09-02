# Payments Architecture Design

**Status:** DRAFT
**Phase:** Phase 2 - Core Platform
**Domain:** Payments

## 1. Architecture Principles

Payments is an independent business domain.

Mission Management owns mission identity, ownership, assignment, and lifecycle.

Payments owns payment records, financial state, authorization, capture, refund, provider interaction, idempotency, and webhook processing.

## 2. High-Level Architecture

```text
Customer
   |
   v
Payments API
   |
   v
Payment Service
   |
   +-------------------+
   |                   |
   v                   v
Payment Database   Idempotency
   |
   v
Provider Adapter
   |
   v
External Provider

External Provider
   |
   v
Webhook Endpoint
   |
   v
Webhook Verification
   |
   v
Payment Service
```

## 3. Domain Boundaries

Mission Management remains the source of truth for Mission.

Payments remains the source of truth for financial state.

Runner assignment does not automatically grant financial authority.

## 4. Core Components

- PaymentController
- PaymentService
- PaymentRepository
- PaymentProvider interface
- PaymentProviderAdapter
- Idempotency component
- Webhook processor

## 5. Payment State Machine

```text
CREATED -> AUTHORIZED
CREATED -> FAILED
CREATED -> CANCELLED
AUTHORIZED -> CAPTURED
AUTHORIZED -> CANCELLED
CAPTURED -> REFUNDED
```

All state transitions must be centralized in PaymentService.

## 6. Authorization

Customer operations require authenticated ownership of the related Mission.

Administrative financial operations require dedicated permissions.

## 7. Idempotency

All externally triggered financial mutations require persistent idempotency protection.

Concurrent duplicate requests must result in one effective financial operation.

## 8. Webhooks

Webhook requests are an external trust boundary.

Webhook processing must verify authenticity, validate the event, deduplicate it, and reconcile the Payment state safely.

## 9. Provider Abstraction

The Payments domain must depend on a provider-neutral interface.

Provider-specific SDKs, status names, errors, and webhook details must remain inside the adapter.

## 10. Monetary Safety

Persisted monetary values must use exact representation.

Client-supplied financial values are untrusted and require server-side validation.

The current Mission model does not contain an approved pricing or quote field.

## 11. Concurrency and Transactions

Financial state changes must use database transactions or conditional updates where required.

Application-level checks alone are insufficient for concurrency-sensitive operations.

## 12. Failure Handling

The system must distinguish validation failure, authorization failure, provider rejection, temporary provider failure, duplicate requests, invalid state transitions, webhook validation failure, and reconciliation failure.

Internal secrets and sensitive payment information must never be exposed.

## 13. Auditability

Payment operations must remain traceable through payment identifiers, mission identifiers, timestamps, provider references, idempotency records, and webhook records.

Sensitive credentials must never be logged.

## 14. MVP Boundary

Included:
- Payment aggregate
- Payment service
- Provider abstraction
- Idempotency
- Webhook boundary
- Authorization
- Exact monetary representation
- Concurrency-safe state transitions

Deferred:
- Runner payouts
- Wallets
- Tips
- Coupons
- Taxes
- Multi-currency conversion
- Disputes and chargebacks
- Accounting ledger

## 15. Database Design Gate

The Database Design must confirm Payment as the financial source of truth, persistent idempotency, webhook deduplication, exact monetary representation, safe concurrency, ownership validation, and compatibility with the existing Prisma schema.
