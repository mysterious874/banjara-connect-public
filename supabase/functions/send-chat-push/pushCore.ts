export type PushEvent =
  | { message_id: string }
  | { group_message_id: string }
  | { event_type: "post_like"; post_id: string }
  | { comment_id: string }
  | { event_type: "follow"; followed_user_id: string }
  | { event_type: "story_like"; story_id: string; notification_id: string }
  | { event_type: "group_join_request" | "group_join_request_result"; group_join_request_id: string }
  | { event_type: "group_member_added" | "group_role_changed" | "group_member_removed"; group_id: string; target_user_id: string }

export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function parsePushEvent(value: unknown): PushEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("A push event is required.", 400)
  }
  const body = value as Record<string, unknown>
  const fields = ["message_id", "group_message_id", "post_id", "comment_id", "followed_user_id", "notification_id", "group_join_request_id"]
  const presentFields = fields.filter((field) => body[field] !== undefined)
  const eventType = body.event_type
  const groupMemberEvent = eventType === "group_member_added" ||
    eventType === "group_role_changed" ||
    eventType === "group_member_removed"

  if (groupMemberEvent) {
    if (presentFields.length || !isUuid(body.group_id) || !isUuid(body.target_user_id)) {
      throw new RequestError("The group event is invalid.", 400)
    }
    return {
      event_type: eventType,
      group_id: body.group_id,
      target_user_id: body.target_user_id,
    }
  }

  if (eventType === "story_like") {
    if (presentFields.length !== 1 || presentFields[0] !== "notification_id" ||
        !isUuid(body.notification_id) || !isUuid(body.story_id)) {
      throw new RequestError("The story event is invalid.", 400)
    }
    return {
      event_type: "story_like",
      story_id: body.story_id,
      notification_id: body.notification_id,
    }
  }

  if (presentFields.length !== 1) throw new RequestError("Provide exactly one push event.", 400)
  const field = presentFields[0]
  if (!isUuid(body[field])) throw new RequestError("The event identifier is invalid.", 400)

  if (field === "message_id" && eventType === undefined) return { message_id: body.message_id as string }
  if (field === "group_message_id" && eventType === undefined) return { group_message_id: body.group_message_id as string }
  if (field === "post_id" && eventType === "post_like") {
    return { event_type: "post_like", post_id: body.post_id as string }
  }
  if (field === "comment_id" && eventType === undefined) return { comment_id: body.comment_id as string }
  if (field === "followed_user_id" && eventType === "follow") {
    return { event_type: "follow", followed_user_id: body.followed_user_id as string }
  }
  if (field === "group_join_request_id" &&
      (eventType === "group_join_request" || eventType === "group_join_request_result")) {
    return { event_type: eventType, group_join_request_id: body.group_join_request_id as string }
  }
  throw new RequestError("The push event type is invalid.", 400)
}

export function notificationMatchesPushEvent(
  notification: Record<string, unknown>,
  actorId: string,
  event: PushEvent,
) {
  if (notification.actor_id !== actorId || notification.user_id === actorId) return false
  if ("message_id" in event) return notification.type === "message" && notification.message_id === event.message_id
  if ("group_message_id" in event) {
    return notification.type === "group_message" && notification.group_message_id === event.group_message_id
  }
  if ("post_id" in event) return notification.type === "post_like" && notification.post_id === event.post_id
  if ("comment_id" in event) {
    return notification.comment_id === event.comment_id &&
      (notification.type === "post_comment" || notification.type === "comment_reply")
  }
  if ("followed_user_id" in event) return notification.type === "follow" && notification.user_id === event.followed_user_id
  if ("story_id" in event) {
    return notification.type === "story_like" &&
      notification.id === event.notification_id &&
      notification.story_id === event.story_id
  }
  if ("group_join_request_id" in event) {
    return notification.type === event.event_type &&
      notification.group_join_request_id === event.group_join_request_id
  }
  return notification.type === event.event_type &&
    notification.group_id === event.group_id &&
    notification.user_id === event.target_user_id
}

export function isPermanentPushFailure(status: number | undefined) {
  return status === 404 || status === 410
}

export function pushFailureStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error) ||
      typeof error.statusCode !== "number") return undefined
  return error.statusCode
}

export async function sendWithExpiredCleanup(
  send: () => Promise<unknown>,
  onFailure: (error: unknown) => Promise<void>,
) {
  try {
    await send()
    return true
  } catch (error) {
    await onFailure(error)
    return false
  }
}

export type DeliveryClaimStore = {
  insertIfMissing: (eventId: string, subscriptionId: string, now: string) => Promise<boolean>
  retryFailed: (eventId: string, subscriptionId: string, now: string) => Promise<boolean>
  reclaimStale: (eventId: string, subscriptionId: string, now: string, staleBefore: string) => Promise<boolean>
}

export async function claimPushDelivery(
  store: DeliveryClaimStore,
  eventId: string,
  subscriptionId: string,
  now: string,
  staleBefore: string,
) {
  if (await store.insertIfMissing(eventId, subscriptionId, now)) return true
  if (await store.retryFailed(eventId, subscriptionId, now)) return true
  return store.reclaimStale(eventId, subscriptionId, now, staleBefore)
}
