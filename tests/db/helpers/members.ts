// Synthetic people and applications for the RLS tests. Call these as the superuser, before actAs().
import { newUserId, type Tx } from './db'

type MemberOptions = {
  isAdmin?: boolean
  status?: 'active' | 'deactivated'
  level?: 'new' | 'fresh' | 'experienced'
}

/** An auth user with no member row: someone signed in who was never approved. */
export async function addAuthUser(tx: Tx): Promise<string> {
  const id = newUserId()
  await tx`insert into auth.users (id, email) values (${id}, ${`${id}@example.test`})`
  return id
}

export async function addMember(tx: Tx, options: MemberOptions = {}): Promise<string> {
  const id = await addAuthUser(tx)
  await tx`
    insert into public.users (id, display_name, real_name, email, city, level, is_admin, status)
    values (
      ${id}, ${`Display ${id}`}, ${`Real ${id}`}, ${`${id}@example.test`}, 'Testville',
      ${options.level ?? 'new'}, ${options.isAdmin ?? false}, ${options.status ?? 'active'}
    )`
  return id
}

export async function insertApplication(tx: Tx, email = `${newUserId()}@example.test`) {
  await tx`
    insert into public.applications (
      display_name, real_name, email, city, heard_via,
      privacy_accepted_at, special_category_consent_at, notice_version
    ) values (
      'Applicant', 'Applicant Fixture', ${email}, 'Testville', 'word_of_mouth',
      now(), now(), 'test-notice'
    )`
}
