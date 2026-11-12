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

const core = loadTypeScript('supabase/functions/send-chat-push/pushCore.ts')
const { parseNotificationPayload, safeNotificationPath, runBestEffortPush } = loadTypeScript('src/utils/pushNotificationUrl.ts')
const actorId = '11111111-1111-4111-8111-111111111111'
const recipientId = '22222222-2222-4222-8222-222222222222'
const storyId = '33333333-3333-4333-8333-333333333333'
const notificationId = '44444444-4444-4444-8444-444444444444'

test('push event parser accepts supported events and rejects malformed or ambiguous requests', () => {
  assert.deepEqual(core.parsePushEvent({ message_id: notificationId }), { message_id: notificationId })
  assert.deepEqual(core.parsePushEvent({
    event_type: 'story_like',
    story_id: storyId,
    notification_id: notificationId,
  }), { event_type: 'story_like', story_id: storyId, notification_id: notificationId })
  assert.throws(() => core.parsePushEvent({ message_id: 'not-a-uuid' }), { status: 400 })
  assert.throws(() => core.parsePushEvent({ message_id: notificationId, comment_id: storyId }), { status: 400 })
  assert.throws(() => core.parsePushEvent({ notification_id: notificationId }), { status: 400 })
  assert.throws(() => core.parsePushEvent({ event_type: 'story_like', notification_id: notificationId }), { status: 400 })
})

test('notification authorization binds an event to its actor, recipient and type', () => {
  const storyEvent = { event_type: 'story_like', story_id: storyId, notification_id: notificationId }
  const notification = {
    id: notificationId,
    actor_id: actorId,
    user_id: recipientId,
    type: 'story_like',
    story_id: storyId,
  }
  assert.equal(core.notificationMatchesPushEvent(notification, actorId, storyEvent), true)
  assert.equal(core.notificationMatchesPushEvent({ ...notification, actor_id: recipientId }, actorId, storyEvent), false)
  assert.equal(core.notificationMatchesPushEvent({ ...notification, user_id: actorId }, actorId, storyEvent), false)
  assert.equal(core.notificationMatchesPushEvent({ ...notification, type: 'group_member_removed' }, actorId, storyEvent), false)
})

test('story likes and group join results must match their exact notification records', () => {
  const storyEvent = { event_type: 'story_like', story_id: storyId, notification_id: notificationId }
  const storyNotification = {
    id: notificationId,
    actor_id: actorId,
    user_id: recipientId,
    type: 'story_like',
    story_id: storyId,
  }
  assert.equal(core.notificationMatchesPushEvent(storyNotification, actorId, storyEvent), true)
  assert.equal(core.notificationMatchesPushEvent({ ...storyNotification, story_id: recipientId }, actorId, storyEvent), false)
  assert.equal(core.notificationMatchesPushEvent({ ...storyNotification, story_id: null }, actorId, storyEvent), false)

  const requestId = '55555555-5555-4555-8555-555555555555'
  const resultEvent = { event_type: 'group_join_request_result', group_join_request_id: requestId }
  const resultNotification = {
    id: notificationId,
    actor_id: actorId,
    user_id: recipientId,
    type: 'group_join_request_result',
    group_join_request_id: requestId,
  }
  assert.equal(core.notificationMatchesPushEvent(resultNotification, actorId, resultEvent), true)
  assert.equal(core.notificationMatchesPushEvent({ ...resultNotification, group_join_request_id: storyId }, actorId, resultEvent), false)
})

test('delivery claim allows only one concurrent sender and permits failed/stale retries', async () => {
  const records = new Map()
  const store = {
    async insertIfMissing(eventId, subscriptionId, now) {
      const key = `${eventId}:${subscriptionId}`
      if (records.has(key)) return false
      records.set(key, { status: 'pending', updatedAt: now })
      return true
    },
    async retryFailed(eventId, subscriptionId, now) {
      const record = records.get(`${eventId}:${subscriptionId}`)
      if (record?.status !== 'failed') return false
      Object.assign(record, { status: 'pending', updatedAt: now })
      return true
    },
    async reclaimStale(eventId, subscriptionId, now, staleBefore) {
      const record = records.get(`${eventId}:${subscriptionId}`)
      if (record?.status !== 'pending' || record.updatedAt >= staleBefore) return false
      Object.assign(record, { status: 'pending', updatedAt: now })
      return true
    },
  }
  const claims = await Promise.all([
    core.claimPushDelivery(store, notificationId, 'device-1', '2026-01-01T00:00:00.000Z', '2025-12-31T23:55:00.000Z'),
    core.claimPushDelivery(store, notificationId, 'device-1', '2026-01-01T00:00:00.000Z', '2025-12-31T23:55:00.000Z'),
  ])
  assert.equal(claims.filter(Boolean).length, 1)

  records.get(`${notificationId}:device-1`).status = 'failed'
  assert.equal(await core.claimPushDelivery(store, notificationId, 'device-1', '2026-01-01T00:01:00.000Z', '2025-12-31T23:56:00.000Z'), true)
  assert.equal(await core.claimPushDelivery(store, notificationId, 'device-1', '2026-01-01T00:02:00.000Z', '2025-12-31T23:57:00.000Z'), false)

  records.get(`${notificationId}:device-1`).updatedAt = '2025-12-31T23:00:00.000Z'
  assert.equal(await core.claimPushDelivery(store, notificationId, 'device-1', '2026-01-01T00:03:00.000Z', '2025-12-31T23:58:00.000Z'), true)
})

test('only permanent web-push endpoint failures trigger subscription cleanup', () => {
  assert.equal(core.isPermanentPushFailure(404), true)
  assert.equal(core.isPermanentPushFailure(410), true)
  assert.equal(core.isPermanentPushFailure(429), false)
  assert.equal(core.isPermanentPushFailure(500), false)
  assert.equal(core.isPermanentPushFailure(undefined), false)
})

test('expired subscriptions are removed while temporary delivery failures are retained', async () => {
  const removed = []
  const sendExpired = await core.sendWithExpiredCleanup(
    async () => { throw { statusCode: 410 } },
    async (error) => {
      if (core.isPermanentPushFailure(core.pushFailureStatus(error))) removed.push('expired')
    },
  )
  const sendTemporary = await core.sendWithExpiredCleanup(
    async () => { throw { statusCode: 503 } },
    async (error) => {
      if (core.isPermanentPushFailure(core.pushFailureStatus(error))) removed.push('temporary')
    },
  )
  assert.equal(sendExpired, false)
  assert.equal(sendTemporary, false)
  assert.deepEqual(removed, ['expired'])
})

test('notification URLs stay on the app origin and fall back when malformed', () => {
  assert.equal(safeNotificationPath('/chat/abc?source=push#latest', 'https://connect.example'), '/chat/abc?source=push#latest')
  assert.equal(safeNotificationPath('https://evil.example/steal', 'https://connect.example'), '/notifications')
  assert.equal(safeNotificationPath('//evil.example/steal', 'https://connect.example'), '/notifications')
  assert.equal(safeNotificationPath('http://[', 'https://connect.example'), '/notifications')
  assert.equal(safeNotificationPath(undefined, 'https://connect.example'), '/notifications')
})

test('notification payload parsing rejects non-objects and bounds untrusted text fields', () => {
  assert.equal(parseNotificationPayload(null), null)
  assert.equal(parseNotificationPayload([]), null)
  const payload = parseNotificationPayload({
    title: 'T'.repeat(200),
    body: 'B'.repeat(300),
    url: { unexpected: true },
    tag: 'x'.repeat(200),
    event_id: 42,
  })
  assert.equal(payload.title.length, 120)
  assert.equal(payload.body.length, 240)
  assert.equal(payload.url, undefined)
  assert.equal(payload.tag.length, 128)
  assert.equal(payload.event_id, undefined)
})

test('best-effort push failure is reported and never rejects the user action', async () => {
  let reported
  await assert.doesNotReject(runBestEffortPush(
    async () => { throw new Error('offline') },
    (error) => { reported = error },
  ))
  assert.equal(reported.message, 'offline')
  await assert.doesNotReject(runBestEffortPush(
    async () => { throw new Error('offline') },
    () => { throw new Error('logger failure') },
  ))
})
