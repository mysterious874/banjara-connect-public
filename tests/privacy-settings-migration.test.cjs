const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('activity privacy migration creates an RLS-protected realtime settings table and preserves legacy values', () => {
  const migration = fs.readFileSync(path.resolve(
    __dirname, '..', 'supabase/migrations/20261112205554_move_activity_status_to_private_settings.sql',
  ), 'utf8')

  assert.match(migration, /create table if not exists public\.user_privacy_settings/i)
  assert.match(migration, /alter table public\.user_privacy_settings enable row level security/i)
  assert.match(migration, /user_privacy_settings_select_own[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)/i)
  assert.match(migration, /user_privacy_settings_insert_own[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/i)
  assert.match(migration, /user_privacy_settings_update_own[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/i)
  assert.match(migration, /alter publication supabase_realtime add table public\.user_privacy_settings/i)
  assert.ok(migration.indexOf('insert into public.user_privacy_settings') < migration.indexOf('alter table public.profiles drop column hide_activity_status'))
  assert.doesNotMatch(migration, /drop table|truncate table|delete from public\.user_privacy_settings/i)
})
