-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('offline', 'online', 'on_trip');
CREATE TYPE "TripStatus" AS ENUM ('requested', 'matched', 'arriving', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE "ReviewParty" AS ENUM ('rider', 'driver');

-- CreateTable: Rider
CREATE TABLE "Rider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "defaultPaymentMethodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Rider_email_key" ON "Rider"("email");
CREATE INDEX "Rider_deletedAt_idx" ON "Rider"("deletedAt");

-- CreateTable: Driver
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'offline',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");
CREATE UNIQUE INDEX "Driver_licenseNumber_key" ON "Driver"("licenseNumber");
CREATE UNIQUE INDEX "Driver_vehiclePlate_key" ON "Driver"("vehiclePlate");
CREATE INDEX "Driver_status_online_idx" ON "Driver"("status") WHERE "status" = 'online';

-- CreateTable: Trip
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'requested',
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DECIMAL(9,6) NOT NULL,
    "pickupLng" DECIMAL(9,6) NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLat" DECIMAL(9,6) NOT NULL,
    "dropoffLng" DECIMAL(9,6) NOT NULL,
    "fareAmountMinor" INTEGER,
    "fareCurrency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "distanceMeters" INTEGER,
    "durationSeconds" INTEGER,
    "driverNameSnapshot" TEXT,
    "driverPlateSnapshot" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Trip_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_fareAmountMinor_check" CHECK ("fareAmountMinor" IS NULL OR "fareAmountMinor" >= 0)
);
CREATE INDEX "Trip_driverId_status_idx" ON "Trip"("driverId", "status");
CREATE UNIQUE INDEX "Trip_riderId_active_key" ON "Trip"("riderId") WHERE "status" NOT IN ('completed', 'cancelled');

-- CreateTable: Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "providerChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_amountMinor_check" CHECK ("amountMinor" > 0)
);
CREATE UNIQUE INDEX "Payment_tripId_key" ON "Payment"("tripId");
CREATE UNIQUE INDEX "Payment_providerChargeId_key" ON "Payment"("providerChargeId");

-- CreateTable: Review
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "authorType" "ReviewParty" NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetType" "ReviewParty" NOT NULL,
    "targetId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "Review_tripId_authorType_key" ON "Review"("tripId", "authorType");
CREATE INDEX "Review_targetType_targetId_idx" ON "Review"("targetType", "targetId");

-- Trip state machine, enforced in the database
CREATE OR REPLACE FUNCTION enforce_trip_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."status" = NEW."status" THEN
        RETURN NEW;
    END IF;

    IF (OLD."status", NEW."status") IN (
        ('requested', 'matched'),
        ('requested', 'cancelled'),
        ('matched', 'arriving'),
        ('matched', 'cancelled'),
        ('arriving', 'in_progress'),
        ('arriving', 'cancelled'),
        ('in_progress', 'completed')
    ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid Trip status transition: % -> % (trip %)', OLD."status", NEW."status", OLD."id"
        USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trip_status_transition_guard
    BEFORE UPDATE ON "Trip"
    FOR EACH ROW
    EXECUTE FUNCTION enforce_trip_status_transition();

-- A review can only be inserted for a completed trip
CREATE OR REPLACE FUNCTION enforce_review_trip_completed()
RETURNS TRIGGER AS $$
DECLARE
    trip_status "TripStatus";
BEGIN
    SELECT "status" INTO trip_status FROM "Trip" WHERE "id" = NEW."tripId";

    IF trip_status IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION 'Cannot review trip % — trip status is %, not completed', NEW."tripId", trip_status
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_requires_completed_trip
    BEFORE INSERT ON "Review"
    FOR EACH ROW
    EXECUTE FUNCTION enforce_review_trip_completed();

-- Driver.rating kept as a rolling average, updated on every review insert
CREATE OR REPLACE FUNCTION refresh_driver_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."targetType" = 'driver' THEN
        UPDATE "Driver"
        SET "rating" = (
            SELECT ROUND(AVG("rating")::numeric, 2)
            FROM "Review"
            WHERE "targetType" = 'driver' AND "targetId" = NEW."targetId"
        )
        WHERE "id" = NEW."targetId";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_updates_driver_rating
    AFTER INSERT ON "Review"
    FOR EACH ROW
    EXECUTE FUNCTION refresh_driver_rating();