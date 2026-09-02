-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('DRAFT', 'OPEN', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "runnerId" TEXT,
    "status" "MissionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mission_customerId_createdAt_idx" ON "Mission"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Mission_runnerId_status_idx" ON "Mission"("runnerId", "status");

-- CreateIndex
CREATE INDEX "Mission_status_createdAt_idx" ON "Mission"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
