const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadTypeScript(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'require', 'module', output)(module.exports, require, module)
  return module.exports
}

const { canEditChatMessage, chatReplyPreview, getChatSearchIndexes, isAudioMediaPath, isMessageReadByReceipt, isTypingFresh } = loadTypeScript('src/utils/chatMessageFeatures.ts')

test('message search reports matching loaded rows case-insensitively and includes media type', () => {
  const messages = [
    { content: 'Meet after work', media_type: null },
    { content: '', media_type: 'image' },
    { content: 'Hello there', media_type: null },
  ]
  assert.deepEqual(getChatSearchIndexes(messages, 'AFTER'), [0])
  assert.deepEqual(getChatSearchIndexes(messages, 'image'), [1])
  assert.deepEqual(getChatSearchIndexes(messages, '  '), [])
})

test('only the author can edit a live text message', () => {
  const message = { sender_id: 'user-a', content: 'Original', is_deleted_for_everyone: false }
  assert.equal(canEditChatMessage(message, 'user-a'), true)
  assert.equal(canEditChatMessage(message, 'user-b'), false)
  assert.equal(canEditChatMessage({ ...message, content: '' }, 'user-a'), false)
  assert.equal(canEditChatMessage({ ...message, is_deleted_for_everyone: true }, 'user-a'), false)
})

test('reply previews are bounded and identify media-only messages', () => {
  assert.equal(chatReplyPreview('  short  '), 'short')
  assert.equal(chatReplyPreview('x'.repeat(130)).length, 121)
  assert.equal(chatReplyPreview('', 'video'), 'Video message')
  assert.equal(chatReplyPreview(''), 'Message unavailable')
})

test('typing indicators expire and reject invalid or future timestamps', () => {
  const now = Date.parse('2026-11-03T08:00:10.000Z')
  assert.equal(isTypingFresh('2026-11-03T08:00:06.000Z', now), true)
  assert.equal(isTypingFresh('2026-11-03T08:00:00.000Z', now), false)
  assert.equal(isTypingFresh('2026-11-03T08:00:11.000Z', now), false)
  assert.equal(isTypingFresh('invalid', now), false)
})

test('group receipt markers only report messages at or before the persisted last-read message', () => {
  const current = { id: 'm2', created_at: '2026-11-03T08:00:02.000Z' }
  assert.equal(isMessageReadByReceipt(current, { last_read_message_id: 'm2', last_read_at: current.created_at }), true)
  assert.equal(isMessageReadByReceipt(current, { last_read_message_id: 'm3', last_read_at: '2026-11-03T08:00:03.000Z' }), true)
  assert.equal(isMessageReadByReceipt(current, { last_read_message_id: 'm1', last_read_at: '2026-11-03T08:00:01.000Z' }), false)
  assert.equal(isMessageReadByReceipt(current, { last_read_message_id: null, last_read_at: null }), false)
})

test('voice note paths are recognized without mistaking document extensions for audio', () => {
  assert.equal(isAudioMediaPath('member/conversation/message/note.webm'), true)
  assert.equal(isAudioMediaPath('note.m4a?token=short-lived'), true)
  assert.equal(isAudioMediaPath('shared/statement.pdf'), false)
  assert.equal(isAudioMediaPath(null), false)
})
