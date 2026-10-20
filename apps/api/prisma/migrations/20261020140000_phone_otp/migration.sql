-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT,
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "pendingName" TEXT NOT NULL,
    "pendingEmail" TEXT NOT NULL,
    "pendingPasswordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_purpose_idx" ON "PhoneOtp"("phone", "purpose");

-- CreateIndex
CREATE INDEX "PhoneOtp_pendingEmail_idx" ON "PhoneOtp"("pendingEmail");
