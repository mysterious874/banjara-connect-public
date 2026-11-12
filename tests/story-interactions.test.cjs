const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

test('story likes use the authenticated RPC instead of inserting notification rows from the client', () => {
  const pages = fs.readFileSync(path.join(root, 'src/pages/Pages.tsx'), 'utf8')
  const start = pages.indexOf('async function likeSelectedStory()')
  const end = pages.indexOf('function isSelectedStoryMuted()', start)
  assert.ok(start >= 0 && end > start)
  const handler = pages.slice(start, end)
  assert.match(handler, /supabase\.rpc\('like_story'/)
  assert.doesNotMatch(handler, /from\('notifications'\)\.insert/)
  assert.match(handler, /if \(notificationId\)/)
})

test('story view upserts do not require an UPDATE policy for duplicate views', () => {
  const storyData = fs.readFileSync(path.join(root, 'src/utils/storyData.ts'), 'utf8')
  const start = storyData.indexOf('export async function recordStoryView')
  const end = storyData.indexOf('export async function loadStoryViewers', start)
  assert.ok(start >= 0 && end > start)
  assert.match(storyData.slice(start, end), /ignoreDuplicates:\s*true/)
})

test('push and story-like migration provisions the schema used by the active app', () => {
  const directory = path.join(root, 'supabase/migrations')
  const migrationNames = fs.readdirSync(directory).filter((name) => name.endsWith('_fix_story_likes_and_push_delivery.sql'))
  assert.equal(migrationNames.length, 1)
  const migration = fs.readFileSync(path.join(directory, migrationNames[0]), 'utf8')
  assert.match(migration, /create table if not exists public\.push_delivery_events/i)
  assert.match(migration, /add column if not exists story_id uuid references public\.stories/i)
  assert.match(migration, /create unique index if not exists notifications_story_like_unique_idx/i)
  assert.match(migration, /create or replace function public\.like_story/i)
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/i)
  assert.match(migration, /create trigger follows_notify_new_follower/i)
  assert.match(migration, /grant execute on function public\.like_story\(uuid\) to authenticated/i)
})
