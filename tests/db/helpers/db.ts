// Helpers for row-level-security tests. Each test runs inside a transaction that is always rolled
// back, so tests leave no data behind and can create tables, policies and rows freely.
// Switch identity with actAs(): policies see the same role and auth.uid() they would in production.
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { assertLocalTarget } from '../../helpers/local-only'

const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
assertLocalTarget('DATABASE_URL', url)
export const sql = postgres(url, { max: 1, onnotice: () => {} })

export type Tx = postgres.TransactionSql

class Rollback extends Error {}

/** Runs fn in a transaction and always rolls it back. Returns whatever fn returns. */
export async function inRolledBackTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await sql.begin(async (tx) => {
      result = await fn(tx)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as T
}

export type Identity =
  | 'superuser'
  | { role: 'anon' }
  | { role: 'service_role' }
  | { role: 'authenticated'; userId: string }

/** Switches the transaction to the given database role, with matching JWT claims for auth.uid(). */
export async function actAs(tx: Tx, who: Identity): Promise<void> {
  await tx.unsafe('reset role')
  if (who === 'superuser') return
  await tx.unsafe(`set local role ${who.role}`)
  const claims = 'userId' in who ? { sub: who.userId, role: who.role } : { role: who.role }
  await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`
}

/** Returns true if the database refuses the statement, without aborting the transaction. */
export async function isDenied(tx: Tx, statement: () => Promise<unknown>): Promise<boolean> {
  try {
    await tx.savepoint(async () => {
      await statement()
    })
    return false
  } catch {
    return true
  }
}

export const newUserId = () => randomUUID()
