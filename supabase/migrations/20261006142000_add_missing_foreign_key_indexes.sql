-- Add covering indexes for foreign-key columns flagged by Supabase performance advisor.
-- These indexes improve FK joins/deletes and common ownership lookups without changing RLS behavior.

create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists comment_likes_user_id_idx on public.comment_likes (user_id);
create index if not exists comments_parent_id_idx on public.comments (parent_id);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists community_group_message_reads_last_read_message_id_idx on public.community_group_message_reads (last_read_message_id);
create index if not exists community_group_messages_sender_id_idx on public.community_group_messages (sender_id);
create index if not exists conversation_members_user_id_idx on public.conversation_members (user_id);
create index if not exists conversations_created_by_idx on public.conversations (created_by);
create index if not exists message_deletions_user_id_idx on public.message_deletions (user_id);
create index if not exists message_reads_user_id_idx on public.message_reads (user_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_comment_id_idx on public.notifications (comment_id);
create index if not exists notifications_message_id_idx on public.notifications (message_id);
create index if not exists notifications_post_id_idx on public.notifications (post_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);
create index if not exists reports_comment_id_idx on public.reports (comment_id);
create index if not exists reports_post_id_idx on public.reports (post_id);
create index if not exists reports_reported_user_id_idx on public.reports (reported_user_id);
