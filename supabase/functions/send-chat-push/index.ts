import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import webpush from "npm:web-push@3.6.7"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  claimPushDelivery,
  isPermanentPushFailure,
  notificationMatchesPushEvent,
  parsePushEvent,
  pushFailureStatus,
  RequestError,
  sendWithExpiredCleanup,
  type PushEvent,
} from "./pushCore.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const notificationColumns = "id,user_id,actor_id,type,post_id,comment_id,message_id,group_id,group_message_id,group_join_request_id,story_id,created_at"

type PushSubscriptionRow = {
  id: string
  user_id: string
  subscription: Parameters<typeof webpush.sendNotification>[0]
}

type NotificationRow = {
  id: string
  user_id: string
  actor_id: string
  type: string
  post_id: string | null
  comment_id: string | null
  message_id: string | null
  group_id: string | null
  group_message_id: string | null
  group_join_request_id: string | null
  story_id: string | null
}

type NotificationContent = {
  body: string
  url: string
}

type PushPayload = NotificationContent & {
  title: string
  icon: string
  badge: string
  event_id: string
  tag: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function requiredEnvironment() {
  const values = {
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
    anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    vapidSubject: Deno.env.get("VAPID_SUBJECT")?.trim(),
    vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY")?.trim(),
    vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY")?.trim(),
  }
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name)
  if (missing.length) {
    console.error("Push configuration is missing required values.", { missing })
    throw new RequestError("Push service is not configured.", 503)
  }
  if (!values.supabaseUrl || !values.anonKey || !values.serviceRoleKey ||
      !values.vapidSubject || !values.vapidPrivateKey || !values.vapidPublicKey) {
    throw new RequestError("Push service is not configured.", 503)
  }
  return {
    supabaseUrl: values.supabaseUrl,
    anonKey: values.anonKey,
    serviceRoleKey: values.serviceRoleKey,
    vapidSubject: values.vapidSubject,
    vapidPrivateKey: values.vapidPrivateKey,
    vapidPublicKey: values.vapidPublicKey,
  }
}

function notificationBody(content: string, fallback: string) {
  const normalized = content.trim()
  return (normalized || fallback).slice(0, 180)
}

async function loadNotificationRows(
  admin: ReturnType<typeof createClient>,
  actorId: string,
  event: PushEvent,
) {
  let query = admin.from("notifications").select(notificationColumns).eq("actor_id", actorId)

  if ("message_id" in event) {
    query = query.eq("message_id", event.message_id).eq("type", "message")
  } else if ("group_message_id" in event) {
    query = query.eq("group_message_id", event.group_message_id).eq("type", "group_message")
  } else if ("post_id" in event) {
    query = query.eq("post_id", event.post_id).eq("type", "post_like")
      .order("created_at", { ascending: false }).limit(1)
  } else if ("comment_id" in event) {
    query = query.eq("comment_id", event.comment_id)
  } else if ("followed_user_id" in event) {
    query = query.eq("user_id", event.followed_user_id).eq("type", "follow")
  } else if ("story_id" in event) {
    query = query.eq("id", event.notification_id).eq("type", "story_like")
  } else if ("group_join_request_id" in event) {
    query = query.eq("group_join_request_id", event.group_join_request_id).eq("type", event.event_type)
  } else {
    query = query.eq("group_id", event.group_id)
      .eq("user_id", event.target_user_id)
      .eq("type", event.event_type)
      .order("created_at", { ascending: false }).limit(1)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as NotificationRow[]
}

async function claimDelivery(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  subscriptionId: string,
) {
  const now = new Date().toISOString()
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  return claimPushDelivery({
    insertIfMissing: async (id, pushSubscriptionId, timestamp) => {
      const { data, error } = await admin.from("push_delivery_events")
        .upsert({
          event_id: id,
          push_subscription_id: pushSubscriptionId,
          status: "pending",
          updated_at: timestamp,
        }, { onConflict: "event_id,push_subscription_id", ignoreDuplicates: true })
        .select("event_id")
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
    retryFailed: async (id, pushSubscriptionId, timestamp) => {
      const { data, error } = await admin.from("push_delivery_events")
        .update({ status: "pending", updated_at: timestamp })
        .eq("event_id", id)
        .eq("push_subscription_id", pushSubscriptionId)
        .eq("status", "failed")
        .select("event_id")
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
    reclaimStale: async (id, pushSubscriptionId, timestamp, expiredBefore) => {
      const { data, error } = await admin.from("push_delivery_events")
        .update({ status: "pending", updated_at: timestamp })
        .eq("event_id", id)
        .eq("push_subscription_id", pushSubscriptionId)
        .eq("status", "pending")
        .lt("updated_at", expiredBefore)
        .select("event_id")
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
  }, eventId, subscriptionId, now, staleBefore)
}

function createPayload(
  notification: NotificationRow,
  senderName: string,
  content: NotificationContent | undefined,
): PushPayload {
  const messages: Record<string, string> = {
    post_like: "liked your post",
    post_comment: "commented on your post",
    comment_reply: "replied to your comment",
    follow: "started following you",
    story_like: "liked your story",
    group_member_added: "added you to a community group",
    group_role_changed: "changed your role in a community group",
    group_member_removed: "removed you from a community group",
    group_join_request: "invited you to join a community group",
    group_join_request_result: "responded to your community group request",
  }
  return {
    title: senderName,
    body: content?.body ?? messages[notification.type] ?? "You have a new notification.",
    url: content?.url ?? "/notifications",
    icon: "/banjara-mark.svg",
    badge: "/banjara-mark.svg",
    event_id: notification.id,
    tag: `connect:${notification.id}`,
  }
}

async function deliverNotifications(
  admin: ReturnType<typeof createClient>,
  notifications: NotificationRow[],
  senderId: string,
  senderName: string,
  contentByNotificationId: Map<string, NotificationContent>,
) {
  const recipientIds = [...new Set(notifications
    .filter((notification) => notification.user_id !== senderId)
    .map((notification) => notification.user_id))]
  if (!recipientIds.length) return { sent: 0, failed: 0, duplicates: 0 }

  const { data: subscriptions, error } = await admin.from("push_subscriptions")
    .select("id,user_id,subscription")
    .in("user_id", recipientIds)
  if (error) throw error

  let sent = 0
  let failed = 0
  let duplicates = 0
  await Promise.all((subscriptions ?? []).flatMap((subscription: PushSubscriptionRow) =>
    notifications
      .filter((notification) => notification.user_id === subscription.user_id && notification.user_id !== senderId)
      .map(async (notification) => {
        const claimed = await claimDelivery(admin, notification.id, subscription.id)
        if (!claimed) {
          duplicates += 1
          return
        }

        const delivered = await sendWithExpiredCleanup(
          () => webpush.sendNotification(
            subscription.subscription,
            JSON.stringify(createPayload(
              notification,
              senderName,
              contentByNotificationId.get(notification.id),
            )),
          ),
          async (error) => {
            failed += 1
            const status = pushFailureStatus(error)
            console.error("Push delivery failed.", { status })
            const { error: updateError } = await admin.from("push_delivery_events")
              .update({ status: "failed", updated_at: new Date().toISOString() })
              .eq("event_id", notification.id)
              .eq("push_subscription_id", subscription.id)
            if (updateError) {
              console.error("Could not record failed push delivery.", { errorType: updateError.code || "DatabaseError" })
            }
            if (isPermanentPushFailure(status)) {
              const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("id", subscription.id)
              if (deleteError) {
                console.error("Could not remove an expired push subscription.", { errorType: deleteError.code || "DatabaseError" })
              }
            }
          },
        )
        if (delivered) {
          const { error: updateError } = await admin.from("push_delivery_events")
            .update({ status: "sent", updated_at: new Date().toISOString() })
            .eq("event_id", notification.id)
            .eq("push_subscription_id", subscription.id)
          if (updateError) {
            console.error("Could not record push delivery.", { errorType: updateError.code || "DatabaseError" })
          }
          sent += 1
        }
      }),
  ))
  return { sent, failed, duplicates }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const authorization = request.headers.get("Authorization")
    if (!authorization) throw new RequestError("Authentication is required.", 401)

    const {
      supabaseUrl,
      anonKey,
      serviceRoleKey,
      vapidPrivateKey,
      vapidPublicKey,
      vapidSubject,
    } = requiredEnvironment()
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) throw new RequestError("Authentication is required.", 401)

    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch {
      throw new RequestError("The request body must be valid JSON.", 400)
    }
    const admin = createClient(supabaseUrl, serviceRoleKey)
    if (requestBody && typeof requestBody === "object" && !Array.isArray(requestBody) &&
        (requestBody as Record<string, unknown>).health_check === true) {
      const healthCheck = requestBody as Record<string, unknown>
      if (healthCheck.vapid_public_key !== vapidPublicKey) {
        throw new RequestError("The push service key does not match this app.", 503)
      }
      try {
        webpush.setVapidDetails(
          vapidSubject,
          vapidPublicKey,
          vapidPrivateKey,
        )
      } catch {
        throw new RequestError("The push service configuration is invalid.", 503)
      }
      const [{ error: subscriptionError }, { error: deliveryError }, { error: notificationError }] = await Promise.all([
        admin.from("push_subscriptions").select("id").limit(0),
        admin.from("push_delivery_events").select("event_id").limit(0),
        admin.from("notifications").select("id").limit(0),
      ])
      if (subscriptionError || deliveryError || notificationError) {
        throw new RequestError("The push service database is not ready.", 503)
      }
      return jsonResponse({ ready: true })
    }

    const event = parsePushEvent(requestBody)
    const { data: sender, error: senderError } = await admin.from("profiles")
      .select("display_name,username")
      .eq("id", user.id)
      .maybeSingle()
    if (senderError) throw senderError
    const senderName = sender?.display_name || sender?.username || "A community member"
    const contentByNotificationId = new Map<string, NotificationContent>()
    let notifications: NotificationRow[] = []

    if ("message_id" in event) {
      const { data: message, error } = await admin.from("messages")
        .select("id,conversation_id,sender_id,content")
        .eq("id", event.message_id)
        .maybeSingle()
      if (error) throw error
      if (!message || message.sender_id !== user.id) throw new RequestError("Message not found.", 404)
      notifications = await loadNotificationRows(admin, user.id, event)
      for (const notification of notifications) {
        contentByNotificationId.set(notification.id, {
          body: notificationBody(message.content ?? "", "Sent you a message"),
          url: `/chat/${message.conversation_id}`,
        })
      }
    } else if ("group_message_id" in event) {
      const { data: message, error } = await admin.from("community_group_messages")
        .select("id,group_id,sender_id,content,media_url,is_deleted_for_everyone")
        .eq("id", event.group_message_id)
        .maybeSingle()
      if (error) throw error
      if (!message || message.sender_id !== user.id || message.is_deleted_for_everyone) {
        throw new RequestError("Group message not found.", 404)
      }
      notifications = await loadNotificationRows(admin, user.id, event)
      for (const notification of notifications) {
        contentByNotificationId.set(notification.id, {
          body: notificationBody(message.content ?? "", message.media_url ? "Sent a photo or video" : "Sent a group message"),
          url: `/community/groups/${message.group_id}`,
        })
      }
    } else if ("post_id" in event) {
      const { data: like, error } = await admin.from("post_likes").select("post_id")
        .eq("post_id", event.post_id).eq("user_id", user.id).maybeSingle()
      if (error) throw error
      if (!like) throw new RequestError("Like not found.", 404)
      notifications = await loadNotificationRows(admin, user.id, event)
    } else if ("comment_id" in event) {
      const { data: comment, error } = await admin.from("comments").select("id")
        .eq("id", event.comment_id).eq("user_id", user.id).maybeSingle()
      if (error) throw error
      if (!comment) throw new RequestError("Comment not found.", 404)
      notifications = await loadNotificationRows(admin, user.id, event)
    } else if ("followed_user_id" in event) {
      const { data: follow, error } = await admin.from("follows").select("follower_id")
        .eq("follower_id", user.id).eq("following_id", event.followed_user_id).maybeSingle()
      if (error) throw error
      if (!follow) throw new RequestError("Follow not found.", 404)
      notifications = await loadNotificationRows(admin, user.id, event)
    } else if ("story_id" in event) {
      const { data: story, error: storyError } = await admin.from("stories")
        .select("id,user_id")
        .eq("id", event.story_id)
        .maybeSingle()
      if (storyError) throw storyError
      if (!story || story.user_id === user.id) throw new RequestError("Story not found.", 404)
      notifications = await loadNotificationRows(admin, user.id, event)
      if (notifications.some((notification) => notification.user_id !== story.user_id)) {
        throw new RequestError("Story notification does not match the story owner.", 403)
      }
    } else if ("group_join_request_id" in event) {
      const { data: joinRequest, error: requestError } = await admin.from("community_group_join_requests")
        .select("id,group_id,requester_id,recipient_id,status,responded_at")
        .eq("id", event.group_join_request_id)
        .maybeSingle()
      if (requestError) throw requestError
      if (!joinRequest) throw new RequestError("Join request not found.", 404)

      if (event.event_type === "group_join_request") {
        if (joinRequest.requester_id !== user.id || joinRequest.status !== "pending") {
          throw new RequestError("Join request not found.", 404)
        }
        notifications = await loadNotificationRows(admin, user.id, event)
      } else {
        const { data: membership, error: membershipError } = await admin.from("community_group_members")
          .select("role")
          .eq("group_id", joinRequest.group_id)
          .eq("user_id", user.id)
          .maybeSingle()
        if (membershipError) throw membershipError
        if (membership?.role !== "admin" || joinRequest.status === "pending" || !joinRequest.responded_at) {
          throw new RequestError("Join request result not found.", 404)
        }
        const { data, error } = await admin.from("notifications").select(notificationColumns)
          .eq("actor_id", user.id)
          .eq("user_id", joinRequest.requester_id)
          .eq("group_id", joinRequest.group_id)
            .eq("group_join_request_id", joinRequest.id)
            .eq("type", "group_join_request_result")
          .order("created_at", { ascending: false })
          .limit(1)
        if (error) throw error
        notifications = (data ?? []) as NotificationRow[]
      }
    } else if ("target_user_id" in event) {
      const { data: membership, error: membershipError } = await admin.from("community_group_members")
        .select("role")
        .eq("group_id", event.group_id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (membershipError) throw membershipError
      if (membership?.role !== "admin") throw new RequestError("Only group admins can send this notification.", 403)
      notifications = await loadNotificationRows(admin, user.id, event)
    } else {
      notifications = await loadNotificationRows(admin, user.id, event)
    }

    notifications = notifications.filter((notification) =>
      notificationMatchesPushEvent(notification, user.id, event))

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    )
    const result = await deliverNotifications(
      admin,
      notifications,
      user.id,
      senderName,
      contentByNotificationId,
    )
    return jsonResponse(result)
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500
    if (!(error instanceof RequestError)) {
      console.error("send-chat-push failed.", { errorType: error instanceof Error ? error.name : "UnknownError" })
    }
    return jsonResponse({
      error: error instanceof RequestError ? error.message : "Push delivery failed.",
    }, status)
  }
})
