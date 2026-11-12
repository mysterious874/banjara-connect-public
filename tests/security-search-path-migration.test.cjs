const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('all SECURITY DEFINER routines with a public search path put pg_temp last', () => {
  const migration = fs.readFileSync(path.resolve(
    __dirname, '..', 'supabase/migrations/20261113100000_harden_security_definer_search_paths.sql',
  ), 'utf8')
  const statements = migration.match(/ALTER FUNCTION public\.[^;]+;/gi) ?? []

  assert.equal(statements.length, 23)
  for (const statement of statements) {
    assert.match(statement, /SET search_path = pg_catalog, public, pg_temp/i)
  }
})
