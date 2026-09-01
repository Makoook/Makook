-- CreateTable
CREATE TABLE "OtpRequestLimit" (
    "id" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "type" "VerificationCodeType" NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastRequestedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpRequestLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpRequestLimit_windowStartedAt_idx" ON "OtpRequestLimit"("windowStartedAt");

-- CreateIndex
CREATE INDEX "OtpRequestLimit_lastRequestedAt_idx" ON "OtpRequestLimit"("lastRequestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OtpRequestLimit_identifierHash_type_key" ON "OtpRequestLimit"("identifierHash", "type");
