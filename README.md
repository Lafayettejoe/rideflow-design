# RideFlow — API Design & Data Model

Task 3: a complete API design and data model for a ride-hailing platform, plus a working Postgres implementation proving the model holds.

`DESIGN.md` is the actual design document — requirements, entities, the seven hard design questions, and the API contract. This README covers how to run the implementation.

## What's in this repo

- `DESIGN.md` — the design document (requirements, entities, normalization, money handling, state machine, time/soft-deletes, identifiers, constraints, indexes, API contract, over-fetching and real-time analysis)
- `prisma/schema.prisma` — the schema, source of truth for the models
- `prisma/migrations/` — the SQL that creates the tables, indexes, check constraints, the partial unique index, and the three triggers (state machine guard, review-requires-completed-trip, rolling driver rating)
- `lib/db.ts` — database connection helper
- `prisma/seed.ts` — seeds riders, drivers, and trips across every status in the state machine
- `prisma/queries.ts` — the 5 queries from DESIGN.md §3.7, each run with `EXPLAIN ANALYZE`
- `prisma/proof.ts` — attempts 3 invalid states and confirms the database rejects each one
- `evidence/` — screenshots of the query plans and the rejected invalid inserts

## Running it yourself

Requirements: Node.js, and a Postgres database (this was built and tested against Neon).

```powershell
npm install
```

Create a `.env` file (copy `.env.example`) and fill in your own `DATABASE_URL`:

```
DATABASE_URL="postgresql://neondb_owner:npg_GpTdO2BqaYN1@ep-broad-sea-zagb6q3h-pooler.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

Apply the schema:

```powershell
npx prisma migrate dev --name init
```

Seed the database:

```powershell
npm run seed
```

Run the 5 queries with `EXPLAIN ANALYZE`:

```powershell
npm run queries
```

Prove the 3 invalid states are rejected:

```powershell
npm run proof
```

## What each proof shows

| # | Attempt | Rejected by | Postgres error code |
|---|---|---|---|
| 1 | Rider with an active trip requests a second one | Partial unique index `Trip_riderId_active_key` | `23505` (unique_violation) |
| 2 | Payment row with `amountMinor = 0` | `CHECK` constraint `Payment_amountMinor_check` | `23514` (check_violation) |
| 3 | Completed trip's status set back to `requested` | Trigger `enforce_trip_status_transition` | `23514` (check_violation, raised manually) |

All three are enforced in the database itself, not just in application code — they'd hold even against a bug in future code or a direct database write.