-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'REFUNDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "provider" TEXT,
    "providerPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIdempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT,
    "requestHash" TEXT NOT NULL,
    "status" "PaymentIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "paymentId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "status" "PaymentWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_missionId_idx" ON "Payment"("missionId");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentIdempotency_paymentId_idx" ON "PaymentIdempotency"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentIdempotency_status_idx" ON "PaymentIdempotency"("status");

-- CreateIndex
CREATE INDEX "PaymentIdempotency_createdAt_idx" ON "PaymentIdempotency"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIdempotency_userId_key_operation_key" ON "PaymentIdempotency"("userId", "key", "operation");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_paymentId_idx" ON "PaymentWebhookEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_idx" ON "PaymentWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_receivedAt_idx" ON "PaymentWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIdempotency" ADD CONSTRAINT "PaymentIdempotency_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
