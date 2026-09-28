/**
 * Seeds a realistic, self-consistent dataset: riders, drivers, trips across
 * every status in the state machine, payments for completed trips, and
 * reviews for the completed ones — enough to exercise all 5 indexed queries.
 *
 * Run with: npm run seed
 */
import { pool, cuid } from '../lib/db'

async function main() {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // --- Riders ---
        const riderIds = {
            ada: cuid(),
            femi: cuid(),
            chidi: cuid(),
        }
        for (const [name, id] of [
            ['Ada Obi', riderIds.ada],
            ['Femi Adeyemi', riderIds.femi],
            ['Chidi Nwosu', riderIds.chidi],
        ] as const) {
            await client.query(
                `INSERT INTO "Rider" (id, name, email, phone, "updatedAt")
                 VALUES ($1, $2, $3, $4, now())`,
                [id, name, `${name.split(' ')[0].toLowerCase()}@example.com`, '+234800000000']
            )
        }

        // --- Drivers ---
        const driverIds = {
            emeka: cuid(),
            zainab: cuid(),
            bola: cuid(),
        }
        const drivers = [
            ['Emeka Umeh', driverIds.emeka, 'online', 'Toyota', 'Camry', 'ABJ-101-XY'],
            ['Zainab Bello', driverIds.zainab, 'online', 'Honda', 'Accord', 'ABJ-202-XY'],
            ['Bola Ige', driverIds.bola, 'offline', 'Kia', 'Rio', 'ABJ-303-XY'],
        ] as const
        for (const [name, id, status, make, model, plate] of drivers) {
            await client.query(
                `INSERT INTO "Driver" (id, name, email, phone, "licenseNumber", "vehicleMake", "vehicleModel", "vehiclePlate", status, "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
                [id, name, `${name.split(' ')[0].toLowerCase()}@example.com`, '+234800000001', `LIC-${id.slice(-8)}`, make, model, plate, status]
            )
        }

        // --- Trip 1: fully completed, paid, reviewed both ways ---
        const trip1 = cuid()
        await client.query(
            `INSERT INTO "Trip" (id, "riderId", "driverId", status, "pickupAddress", "pickupLat", "pickupLng",
                "dropoffAddress", "dropoffLat", "dropoffLng", "fareAmountMinor", "fareCurrency",
                "distanceMeters", "durationSeconds", "driverNameSnapshot", "driverPlateSnapshot",
                "matchedAt", "startedAt", "completedAt", "updatedAt")
             VALUES ($1,$2,$3,'requested',$4,$5,$6,$7,$8,$9,NULL,'NGN',NULL,NULL,NULL,NULL,NULL,NULL,NULL, now())`,
            [trip1, riderIds.ada, driverIds.emeka, '14 Aminu Kano Cres, Abuja', 9.0765, 7.3986, 'Nnamdi Azikiwe Airport', 9.0065, 7.2632]
        )
        await client.query(`UPDATE "Trip" SET status = 'matched', "driverId" = $2, "matchedAt" = now(), "driverNameSnapshot" = 'Emeka Umeh', "driverPlateSnapshot" = 'ABJ-101-XY', "updatedAt" = now() WHERE id = $1`, [trip1, driverIds.emeka])
        await client.query(`UPDATE "Trip" SET status = 'arriving', "updatedAt" = now() WHERE id = $1`, [trip1])
        await client.query(`UPDATE "Trip" SET status = 'in_progress', "startedAt" = now(), "updatedAt" = now() WHERE id = $1`, [trip1])
        await client.query(
            `UPDATE "Trip" SET status = 'completed', "completedAt" = now(), "fareAmountMinor" = 250000,
                "distanceMeters" = 18400, "durationSeconds" = 1620, "updatedAt" = now() WHERE id = $1`,
            [trip1]
        )
        const payment1 = cuid()
        await client.query(
            `INSERT INTO "Payment" (id, "tripId", "riderId", "amountMinor", currency, status, provider, "updatedAt")
             VALUES ($1,$2,$3,250000,'NGN','succeeded','paystack', now())`,
            [payment1, trip1, riderIds.ada]
        )
        const review1a = cuid()
        const review1b = cuid()
        await client.query(
            `INSERT INTO "Review" (id, "tripId", "authorType", "authorId", "targetType", "targetId", rating, comment)
             VALUES ($1,$2,'rider',$3,'driver',$4,5,'Smooth ride, great driver')`,
            [review1a, trip1, riderIds.ada, driverIds.emeka]
        )
        await client.query(
            `INSERT INTO "Review" (id, "tripId", "authorType", "authorId", "targetType", "targetId", rating, comment)
             VALUES ($1,$2,'driver',$3,'rider',$4,5,'Polite passenger')`,
            [review1b, trip1, driverIds.emeka, riderIds.ada]
        )

        // --- Trip 2: currently in_progress (Femi + Zainab) ---
        const trip2 = cuid()
        await client.query(
            `INSERT INTO "Trip" (id, "riderId", status, "pickupAddress", "pickupLat", "pickupLng",
                "dropoffAddress", "dropoffLat", "dropoffLng", "updatedAt")
             VALUES ($1,$2,'requested',$3,$4,$5,$6,$7,$8, now())`,
            [trip2, riderIds.femi, 'Wuse Market, Abuja', 9.0643, 7.4783, 'Jabi Lake Mall', 9.0765, 7.4231]
        )
        await client.query(`UPDATE "Trip" SET status = 'matched', "driverId" = $2, "matchedAt" = now(), "updatedAt" = now() WHERE id = $1`, [trip2, driverIds.zainab])
        await client.query(`UPDATE "Trip" SET status = 'arriving', "updatedAt" = now() WHERE id = $1`, [trip2])
        await client.query(`UPDATE "Trip" SET status = 'in_progress', "updatedAt" = now() WHERE id = $1`, [trip2])
        await client.query(`UPDATE "Driver" SET status = 'on_trip', "updatedAt" = now() WHERE id = $1`, [driverIds.zainab])

        // --- Trip 3: requested, not yet matched (Chidi) ---
        const trip3 = cuid()
        await client.query(
            `INSERT INTO "Trip" (id, "riderId", status, "pickupAddress", "pickupLat", "pickupLng",
                "dropoffAddress", "dropoffLat", "dropoffLng", "updatedAt")
             VALUES ($1,$2,'requested',$3,$4,$5,$6,$7,$8, now())`,
            [trip3, riderIds.chidi, 'Garki Area 2, Abuja', 9.0333, 7.4833, 'Maitama District', 9.0833, 7.4833]
        )

        // --- Trip 4: cancelled while requested (Ada's second, older trip) ---
        const trip4 = cuid()
        await client.query(
            `INSERT INTO "Trip" (id, "riderId", status, "pickupAddress", "pickupLat", "pickupLng",
                "dropoffAddress", "dropoffLat", "dropoffLng", "requestedAt", "cancelledAt", "updatedAt")
             VALUES ($1,$2,'requested',$3,$4,$5,$6,$7,$8, now() - interval '2 days', NULL, now())`,
            [trip4, riderIds.ada, 'Central Area, Abuja', 9.05, 7.49, 'Asokoro', 9.03, 7.53]
        )
        await client.query(`UPDATE "Trip" SET status = 'cancelled', "cancelledAt" = now(), "updatedAt" = now() WHERE id = $1`, [trip4])

        await client.query('COMMIT')

        console.log('Seed complete:')
        console.log({ riderIds, driverIds, trips: { trip1, trip2, trip3, trip4 }, payment1 })
    } catch (err) {
        await client.query('ROLLBACK')
        throw err
    } finally {
        client.release()
        await pool.end()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})