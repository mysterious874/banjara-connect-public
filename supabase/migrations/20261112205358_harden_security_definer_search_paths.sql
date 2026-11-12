-- Harden SECURITY DEFINER routines against temporary-schema shadowing.
-- No function bodies, grants, records, or application behavior are changed.
-- pg_catalog is first, the application schema is explicit, and pg_temp is last.
ALTER FUNCTION public.add_community_group_member(uuid,uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_activity_notification() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_community_group(text,text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_community_group_message_for_everyone(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_community_group_message_for_me(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_community_group(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_or_create_direct_conversation(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_community_group_admin(uuid,uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_community_group_member(uuid,uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.leave_community_group(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.list_community_group_media_for_cleanup(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.load_community_group_reports(uuid,integer,integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.mark_community_group_read(uuid,uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.notify_community_group_member_change() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.notify_community_group_message() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.remove_community_group_member(uuid,uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.report_community_group_content(uuid,uuid,uuid,text,text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.request_community_group_join(uuid,uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.request_community_group_join(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.respond_community_group_join_request(uuid,boolean) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.set_community_group_member_role(uuid,uuid,text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.update_community_group_report(uuid,text) SET search_path = pg_catalog, public, pg_temp;
