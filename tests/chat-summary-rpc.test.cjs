const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadChatData({ summaries, profiles, blockedIds }) {
  const filename = path.resolve(__dirname, '..', 'src/utils/chatData.ts')
  const source = fs.readFileSync(filename, 'utf8').replace(/import\\.meta\\.env\\.DEV/g, 'false')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  let rpcCalls = 0
  const queriedTables = []
  const supabase = {
    rpc: async (name) => {
      assert.equal(name, 'get_direct_conversation_summaries')
      rpcCalls += 1
      return { data: summaries, error: null }
    },
    from: (table) => {
      queriedTables.push(table)
      return {
        select() { return this },
        in: async (_column, ids) => ({
          data: profiles.filter((profile) => ids.includes(profile.id)),
          error: null,
        }),
      }
    },
  }

  const mocks = {
    './supabase': { supabase },
    './authenticatedUser': { requireAuthenticatedUserId: async () => 'current-user' },
    './blockData': { loadBlockedUserIds: async () => blockedIds },
    './chatMediaData': {
      createChatMediaUrl: async () => '',
      createChatMediaUrls: async () => new Map(),
      deleteChatMedia: async () => {},
      uploadChatMedia: async () => ({}),
    },
    './pushNotifications': { sendChatPushNotification: async () => {} },
    './realtimeData': { subscribeToPostgresChanges: async () => {} },
  }

  const module = { exports: {} }
  new Function('exports', 'require', 'module', output)(
    module.exports,
    (name) => mocks[name] ?? require(name),
    module,
  )
  return { api: module.exports, getRpcCalls: () => rpcCalls, queriedTables }
}

test('direct conversation list uses one summary RPC and preserves unread counts', async () => {
  const lastMessage = {
    id: 'message-1',
    conversation_id: 'conversation-1',
    sender_id: 'peer-1',
    content: 'Hello',
    media_url: null,
    media_type: null,
    is_deleted_for_everyone: false,
    created_at: '2026-11-13T10:00:00.000Z',
    updated_at: '2026-11-13T10:00:00.000Z',
  }
  const { api, getRpcCalls, queriedTables } = loadChatData({
    summaries: [
      { conversation_id: 'conversation-1', peer_id: 'peer-1', last_message: lastMessage, unread_count: 4 },
      { conversation_id: 'conversation-2', peer_id: 'blocked-peer', last_message: null, unread_count: 2 },
    ],
    profiles: [
      { id: 'peer-1', username: 'peerone', display_name: 'Peer One', avatar_url: null },
      { id: 'blocked-peer', username: 'blocked', display_name: 'Blocked', avatar_url: null },
    ],
    blockedIds: ['blocked-peer'],
  })

  const conversations = await api.loadConversations()

  assert.equal(getRpcCalls(), 1)
  assert.deepEqual(queriedTables, ['profiles'])
  assert.equal(conversations.length, 1)
  assert.equal(conversations[0].id, 'conversation-1')
  assert.equal(conversations[0].lastMessage.id, 'message-1')
  assert.equal(conversations[0].unreadCount, 4)
})

test('direct conversation list returns empty without a profile query when no visible summaries exist', async () => {
  const { api, getRpcCalls, queriedTables } = loadChatData({
    summaries: [{ conversation_id: 'conversation-2', peer_id: 'blocked-peer', last_message: null, unread_count: 1 }],
    profiles: [],
    blockedIds: ['blocked-peer'],
  })

  assert.deepEqual(await api.loadConversations(), [])
  assert.equal(getRpcCalls(), 1)
  assert.deepEqual(queriedTables, [])
})

test('optimized direct conversation RPC migration is invoker-secure and authenticated-only', () => {
  const migration = fs.readFileSync(path.resolve(
    __dirname, '..', 'supabase/migrations/20261112163450_optimize_direct_conversation_summaries.sql',
  ), 'utf8')
  assert.match(migration, /security invoker/i)
  assert.match(migration, /where mine\.user_id = \(select auth\.uid\(\)\)/i)
  assert.match(migration, /revoke all on function[\s\S]*from public, anon/i)
  assert.match(migration, /grant execute on function[\s\S]*to authenticated/i)
})
