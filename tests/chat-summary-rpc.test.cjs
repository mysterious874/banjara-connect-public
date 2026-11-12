const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('chat list uses the database summary RPC instead of per-conversation message queries', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/utils/chatData.ts'), 'utf8')
  assert.match(source, /supabase\.rpc\('get_direct_conversation_summaries'\)/)
  assert.doesNotMatch(source, /Promise\.all\(visibleConversationIds\.map/)
})
