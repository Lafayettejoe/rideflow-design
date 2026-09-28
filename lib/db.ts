import { Pool } from 'pg'

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

// Simple cuid-like id generator so seed/proof scripts don't need Prisma
// Client's runtime.
let counter = 0
export function cuid(): string {
    counter += 1
    const time = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 10)
    return `c${time}${rand}${counter.toString(36)}`.slice(0, 25)
}