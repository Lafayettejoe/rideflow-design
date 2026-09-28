/**
 * Proves 3 invalid states are rejected by the database itself, not just by
 * application code — each of these bypasses any API layer and talks to
 * Postgres directly.
 *
 * Run with: npm run proof
 */
import { pool } from '../lib/db'

async function expectReject(label: string, fn: () => Promise<unknown>) {
    console.log('\n' + '='.repeat(80))
    console.log(label)
    console.log('='.repeat(80))
    try {
        await fn()
        console.log('❌ FAILED — this insert/update should have been rejected but succeeded')
        process.exitCode = 1
    } catch (err: any) {
        console.log(`✅ REJECTED as expected`)
        console.log(`   Postgres error code: ${err.code}`)
        console.log(`   Message: ${err.message}`)
    }
}

async function main() {
    // Invalid #1: rider already has an active trip, tries to request another
    const rider = await pool.query(
        `SELECT r.id FROM "Rider" r
         JOIN "Trip" t ON t."riderId" = r.id
         WHERE t.status NOT IN ('completed', 'cancelled')
         LIMIT 1`
    )
    const riderWithActiveTrip = rider.rows[0].id
    await expectReject(
        'Invalid insert #1 — rider already has an active trip, tries to request another',
        () =>
            pool.query(
                `INSERT INTO "Trip" (id, "riderId", status, "pickupAddress", "pickupLat", "pickupLng",
                    "dropoffAddress", "dropoffLat", "dropoffLng", "updatedAt")
                 VALUES ('proof-invalid-trip-1', $1, 'requested', 'Somewhere', 9.05, 7.49, 'Elsewhere', 9.06, 7.50, now())`,
                [riderWithActiveTrip]
            )
    )

    // Invalid #2: a payment of zero
    const trip = await pool.query(`SELECT id, "riderId" FROM "Trip" LIMIT 1`)
    await expectReject(
        'Invalid insert #2 — a payment row with amountMinor = 0',
        () =>
            pool.query(
                `INSERT INTO "Payment" (id, "tripId", "riderId", "amountMinor", currency, provider, "updatedAt")
                 VALUES ('proof-invalid-payment-1', $1, $2, 0, 'NGN', 'paystack', now())`,
                [trip.rows[0].id, trip.rows[0].riderId]
            )
    )

    // Invalid #3: illegal trip status transition
    const completedTrip = await pool.query(`SELECT id FROM "Trip" WHERE status = 'completed' LIMIT 1`)
    await expectReject(
        'Invalid update #3 — moving a completed trip back to requested (illegal transition)',
        () => pool.query(`UPDATE "Trip" SET status = 'requested' WHERE id = $1`, [completedTrip.rows[0].id])
    )

    await pool.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})