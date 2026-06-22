import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../migrations/0015_invite_atomic_claims.sql', import.meta.url), 'utf8')

assert.match(source, /generateInviteCode\(\)/, 'invite codes must use the centralized secure generator')
assert.match(source, /await sha256Hex\(code\)/, 'only the code hash may be persisted')
assert.match(source, /shown_once:\s*true/, 'new plaintext codes must be marked as shown once')
assert.match(source, /creation_request_id=\?1/, 'invite creation must be idempotent')
assert.match(source, /env\.DB\.batch\(\[\.\.\.claimStatements, consumeStatement\]\)/, 'scope claims and consumption must share a D1 transaction')
assert.match(source, /used_count = used_count \+ 1/, 'max-use consumption must be atomic')
assert.match(migration, /PRIMARY KEY \(invite_code_id, claim_type, claim_value\)/, 'scope claims require a unique key')
assert.match(source, /INSERT INTO invite_code_claims[\s\S]+WHERE EXISTS \(SELECT 1 FROM invite_codes/, 'claims must only be inserted while capacity is available')
assert.doesNotMatch(source, /SELECT[^\n]+code_hash[^\n]+FROM invite_codes[^\n]+\/v1\/admin/i, 'admin list must not expose code hashes')

console.log('Phase F invite security contract checks passed.')
