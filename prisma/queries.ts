/**
 * The 5 queries backing the 5 actions from DESIGN.md §1 / §3.7, each run
 * with EXPLAIN ANALYZE to show the index actually being used.
 *
 * Run with: npm run queries
 */
import { pool } from '../lib/db'

async function explain(label: string, sql: string, params: unknown[] = []) {
    console.log('\n' + '='.repeat(80))
    console.log(label)
    console.log('='.repeat(80))
    console.log('SQL:', sql.trim().replace(/\s+/g, ' '))
    const { rows } = await pool.query(`EXPLAIN ANALYZE ${sql}`, params)
    console.log(rows.map((r: any) => r['QUERY PLAN']).join('\n'))
}

async function main() {
    const anyRider = await pool.query(`SELECT id FROM "Rider" LIMIT 1`)
    await explain(
        'Action 1 — Rider requests a trip: check for an existing active trip',
        `SELECT id, status FROM "Trip" WHERE "riderId" = $1 AND status NOT IN ('completed', 'cancelled')`,
        [anyRider.rows[0].id]
    )

    await explain(
        "Action 2 — Match to an available driver: find drivers where status = 'online'",
        `SELECT id, name, "vehiclePlate", rating FROM "Driver" WHERE status = 'online' LIMIT 1`
    )

    const busyDriver = await pool.query(`SELECT id FROM "Driver" WHERE status = 'on_trip' LIMIT 1`)
    await explain(
        "Action 3 — Driver progresses a trip: find this driver's current trip",
        `SELECT id, status FROM "Trip" WHERE "driverId" = $1 AND status NOT IN ('completed', 'cancelled')`,
        [busyDriver.rows[0].id]
    )

    const paidTrip = await pool.query(`SELECT id FROM "Trip" WHERE status = 'completed' LIMIT 1`)
    await explain(
        'Action 4 — Capture payment: look up the payment row for a trip',
        `SELECT id, status, "amountMinor" FROM "Payment" WHERE "tripId" = $1`,
        [paidTrip.rows[0].id]
    )

    const reviewedDriver = await pool.query(
        `SELECT DISTINCT "targetId" FROM "Review" WHERE "targetType" = 'driver' LIMIT 1`
    )
    await explain(
        'Action 5 — Leave/read reviews: all reviews about a given driver',
        `SELECT id, rating, comment FROM "Review" WHERE "targetType" = 'driver' AND "targetId" = $1`,
        [reviewedDriver.rows[0].targetId]
    )

    await pool.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})