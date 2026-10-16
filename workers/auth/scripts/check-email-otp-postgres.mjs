import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const psql = process.env.SATURN_OTP_TEST_PSQL
const container = process.env.SATURN_OTP_TEST_CONTAINER
const port = process.env.SATURN_OTP_TEST_PORT
const database = 'saturn_otp_admission_test'
if (!psql || !/^\d{4,5}$/.test(port || '')) throw new Error('isolated_postgres_parameters_required')
if (container && !/^[a-zA-Z0-9_-]{1,128}$/.test(container)) throw new Error('invalid_test_container')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function query(sql, { db = database, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(container ? 'docker' : psql, [...(container ? ['exec', '-i', '--env', 'PGPASSWORD', container, psql] : []), '-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', port,
      '-U', 'otp_qa_admin', '-d', db, '-v', 'ON_ERROR_STOP=1'], { timeout: 20_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !allowFailure) reject(new Error(stderr || error.message))
      else resolve({ ok: !error, stdout: stdout.trim(), stderr })
    })
    child.stdin.end(sql)
  })
}
const exists = await query(`select datname from pg_database where datname='${database}';`, { db: 'postgres' })
if (exists.stdout) throw new Error('isolated_test_database_already_exists')
await query(`create database ${database};`, { db: 'postgres' })
try {
  await query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;")
  await query("create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as 'begin new.updated_at=clock_timestamp(); return new; end';")
  await query(fs.readFileSync(path.join(root, 'migrations/008_email_verification_core.sql'), 'utf8'))
  const missing = await query("set role service_role; insert into public.account_email_verifications(email,code_hash,purpose,expires_at,admission_version) values('missing@example.test','synthetic','registration',now()+interval '15 minutes',1);", { allowFailure: true })
  assert.equal(missing.ok, false)
  await query("insert into public.account_email_verifications(email,code_hash,purpose,status,resend_count,last_sent_at,expires_at) values('legacy-quota@example.test','synthetic-legacy','registration','blocked',5,now()-interval '60 seconds',now()+interval '15 minutes');")
  await query(fs.readFileSync(path.join(root, 'migrations/20261016125303_email_otp_atomic_admission.sql'), 'utf8'))
  const insert = (email, purpose = 'registration', hash = 'synthetic-initial') => `set role service_role; insert into public.account_email_verifications(email,code_hash,purpose,expires_at,metadata) values('${email}','${hash}','${purpose}',clock_timestamp()+interval '15 minutes','{"transport":"test"}') returning id;`
  const age = (email) => `update public.email_otp_admission set last_admitted_at=clock_timestamp()-interval '46 seconds' where recipient_digest=encode(sha256(convert_to('${email}','UTF8')),'hex');`
  assert.match((await query(insert('legacy-quota@example.test', 'email_verification'), { allowFailure: true })).stderr, /email_verification_admission_rate_limited/, 'migration must preserve the budget of terminal legacy rows')
  const attempts = await Promise.all(Array.from({ length: 20 }, () => query(insert('concurrent@example.test'), { allowFailure: true })))
  assert.equal(attempts.filter((r) => r.ok).length, 1, 'concurrent first admission sends once')
  assert.equal((await query("select count(*) from public.account_email_verifications where email='concurrent@example.test';")).stdout, '1')
  await query(age('concurrent@example.test'))
  const resends = await Promise.all(Array.from({ length: 16 }, (_, index) => query(`set role service_role; update public.account_email_verifications set code_hash='synthetic-concurrent-${index}',resend_count=resend_count+1 where email='concurrent@example.test';`, { allowFailure: true })))
  assert.equal(resends.filter((r) => r.ok).length, 1, 'parallel resends admit one new code')
  assert.equal((await query("select admissions from public.email_otp_admission where recipient_digest=encode(sha256(convert_to('concurrent@example.test','UTF8')),'hex');")).stdout, '2')
  for (const status of ['blocked', 'expired', 'delivery_failed', 'verified', 'consumed']) {
    const email = `${status}@example.test`
    await query(insert(email))
    await query(`update public.account_email_verifications set status='${status}' where email='${email}';`)
    const blocked = await query(insert(email, 'email_verification', 'synthetic-new'), { allowFailure: true })
    assert.equal(blocked.ok, false, `${status} cannot reset cooldown via other issuance route`)
    assert.match(blocked.stderr, /email_verification_admission_rate_limited/)
  }
  const budgetEmail = 'quota@example.test'
  await query(insert(budgetEmail))
  for (let send = 1; send <= 5; send += 1) {
    await query(age(budgetEmail))
    await query(`set role service_role; update public.account_email_verifications set code_hash='synthetic-${send}',resend_count=${send},expires_at=clock_timestamp()+interval '15 minutes' where email='${budgetEmail}';`)
  }
  await query(age(budgetEmail))
  await query(`update public.account_email_verifications set status='blocked' where email='${budgetEmail}';`)
  assert.equal((await query(insert(budgetEmail), { allowFailure: true })).ok, false, 'cancel cannot reset exhausted quota')
  assert.equal((await query("select admissions from public.email_otp_admission where recipient_digest=encode(sha256(convert_to('quota@example.test','UTF8')),'hex');")).stdout, '6')
  await query(insert('same-code@example.test'))
  await query(age('same-code@example.test'))
  await query("set role service_role; update public.account_email_verifications set code_hash=code_hash,resend_count=resend_count+1 where email='same-code@example.test';")
  assert.equal((await query("select admissions from public.email_otp_admission where recipient_digest=encode(sha256(convert_to('same-code@example.test','UTF8')),'hex');")).stdout, '2', 'a coincidentally repeated code must still consume admission')
  await query(insert('cancel-retry@example.test'))
  await query("update public.account_email_verifications set status='blocked' where email='cancel-retry@example.test';" + age('cancel-retry@example.test'))
  await query(insert('cancel-retry@example.test', 'email_verification', 'synthetic-second'))
  assert.equal((await query("select admissions from public.email_otp_admission where recipient_digest=encode(sha256(convert_to('cancel-retry@example.test','UTF8')),'hex');")).stdout, '2')
  await query(insert('rollback@example.test'))
  await query(age('rollback@example.test'))
  await query("begin; set local role service_role; update public.account_email_verifications set code_hash='synthetic-rollback' where email='rollback@example.test'; rollback;")
  assert.equal((await query("select admissions from public.email_otp_admission where recipient_digest=encode(sha256(convert_to('rollback@example.test','UTF8')),'hex');")).stdout, '1')
  await query(insert('delivery@example.test'))
  await query(age('delivery@example.test') + "update public.account_email_verifications set metadata='{\"transport\":\"provider_pending\",\"delivery\":{\"status\":\"queued\"}}' where email='delivery@example.test';")
  assert.match((await query("set role service_role; update public.account_email_verifications set code_hash='synthetic-new' where email='delivery@example.test';", { allowFailure: true })).stderr, /email_verification_admission_conflict/)
  await query("update public.account_email_verifications set metadata=jsonb_build_object('transport','provider_pending','delivery',jsonb_build_object('status','sent','sent_at',clock_timestamp())) where email='delivery@example.test';")
  assert.match((await query("set role service_role; update public.account_email_verifications set code_hash='synthetic-new' where email='delivery@example.test';", { allowFailure: true })).stderr, /email_verification_admission_rate_limited/)
  await query("update public.account_email_verifications set metadata='{\"transport\":\"provider_pending\",\"delivery\":{\"status\":\"failed\"}}' where email='delivery@example.test';")
  await query("set role service_role; update public.account_email_verifications set code_hash='synthetic-new' where email='delivery@example.test';")
  await query(insert('expiry@example.test'))
  await query("update public.account_email_verifications set expires_at=clock_timestamp()-interval '1 second' where email='expiry@example.test'; update public.email_otp_admission set expires_at=clock_timestamp()-interval '1 second' where recipient_digest=encode(sha256(convert_to('expiry@example.test','UTF8')),'hex');")
  await query(insert('expiry@example.test', 'email_verification'))
  assert.equal((await query("select admissions from public.email_otp_admission where recipient_digest=encode(sha256(convert_to('expiry@example.test','UTF8')),'hex');")).stdout, '1', 'expired challenges permit a new bounded budget')
  await query("insert into public.email_otp_admission select encode(sha256(convert_to('expired-synthetic-'||n,'UTF8')),'hex'),1,now()-interval '1 hour',now()-interval '1 second',null,null from generate_series(1,65) n;")
  await query(insert('cleanup@example.test'))
  assert.equal((await query("select count(*) from public.email_otp_admission where expires_at < clock_timestamp();")).stdout, '1', 'cleanup is bounded to 64 expired recipients per admission')
  await query(insert('cleanup-next@example.test'))
  assert.equal((await query("select count(*) from public.email_otp_admission where expires_at < clock_timestamp();")).stdout, '0')
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await query(`set role ${role}; select * from public.email_otp_admission;`, { allowFailure: true })).ok, false)
    assert.equal((await query(`set role ${role}; insert into public.account_email_verifications(email,code_hash,expires_at) values('forged@example.test','synthetic',now()+interval '15 minutes');`, { allowFailure: true })).ok, false)
  }
  assert.equal((await query("set role service_role; update public.account_email_verifications set email='changed@example.test' where email='delivery@example.test';", { allowFailure: true })).ok, false)
  console.log('PostgreSQL OTP admission: concurrency, cross-route quota, terminal states, rollback, delivery, and privilege checks passed.')
} finally {
  await query(`drop database ${database} with (force);`, { db: 'postgres' })
}
