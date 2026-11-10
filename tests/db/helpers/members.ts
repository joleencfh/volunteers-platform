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

/** Fills every optional profile field with synthetic values, so a hidden field shows as null. */
export async function fillProfile(tx: Tx, id: string): Promise<void> {
  await tx`
    update public.users set
      bio = 'Synthetic bio', linkedin_url = 'https://example.test/in/fixture',
      ai_safety_knowledge = 'basic', ai_risks = 'Synthetic risks'
    where id = ${id}`
}

/** Stores a visibility choice for one field of a profile. */
export async function setTier(tx: Tx, id: string, field: string, tier: string): Promise<void> {
  await tx`
    insert into public.profile_visibility (user_id, field, tier) values (${id}, ${field}, ${tier})
    on conflict (user_id, field) do update set tier = excluded.tier`
}

/** Pretends everyone shares a working group, until W-01 replaces the stub. Rolled back with the test. */
export async function everyoneSharesAGroup(tx: Tx): Promise<void> {
  await tx.unsafe(`
    create or replace function public.shares_working_group(a uuid, b uuid)
    returns boolean language sql stable security definer set search_path = ''
    as $$ select true; $$`)
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
