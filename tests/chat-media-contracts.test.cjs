const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadChatMediaData(uploadedFiles) {
  const filename = path.resolve(__dirname, '..', 'src/utils/chatMediaData.ts')
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mocks = {
    './supabase': { supabase: {} },
    './imageUpload': { prepareImageForUpload: async (file) => file },
    './storageUpload': {
      uploadStorageFile: async (bucket, objectPath, file) => uploadedFiles.push({ bucket, objectPath, file }),
    },
  }
  const module = { exports: {} }
  new Function('exports', 'require', 'module', output)(
    module.exports,
    (name) => mocks[name] ?? require(name),
    module,
  )
  return module.exports
}

test('chat voice notes with codec-qualified MIME types upload with the bucket-compatible base type', async () => {
  const uploadedFiles = []
  const { uploadChatMedia } = loadChatMediaData(uploadedFiles)
  const file = new File(['voice'], 'voice.webm', { type: 'audio/webm;codecs=opus' })

  const result = await uploadChatMedia(file, 'user-1', 'conversation-1', 'message-1')

  assert.equal(uploadedFiles.length, 1)
  assert.equal(uploadedFiles[0].file.type, 'audio/webm')
  assert.equal(result.mimeType, 'audio/webm')
  assert.equal(result.type, 'document')
})

test('group join requests use admin authorization, add the requester, and avoid duplicate notifications', () => {
  const migration = fs.readFileSync(path.resolve(
    __dirname,
    '..',
    'supabase/migrations/20261112090000_align_group_join_request_contract.sql',
  ), 'utf8')

  assert.match(migration, /request_community_group_join\(p_group_id uuid\)/i)
  assert.match(migration, /user_id = caller and role = 'admin'/i)
  assert.match(migration, /values\s*\(\s*request_row\.group_id\s*,\s*request_row\.requester_id\s*,\s*'member'\s*\)/i)
  assert.match(migration, /on conflict\s*\(group_id,\s*requester_id,\s*recipient_id\)\s*where status = 'pending'\s*do nothing/i)
  assert.match(migration, /else\s+insert into public\.notifications\(user_id, actor_id, type, group_id, group_join_request_id\)/i)
  assert.match(migration, /set_config\('banjara\.group_join_request_id', request_row\.id::text, true\)/i)
  assert.match(migration, /approval_request_id is not null and exists\s*\([\s\S]*?request_row\.requester_id = new\.user_id[\s\S]*?\)\s+then\s+return new;/i)
})
