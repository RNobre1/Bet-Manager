-- ============================================================
-- Security hardening from Supabase advisors:
-- 1) Views must run as SECURITY INVOKER so RLS of querying user applies.
-- 2) Set search_path on functions that lacked it.
-- 3) Revoke EXECUTE on internal trigger handlers and the snapshot
--    generator from anon/authenticated (only service_role / triggers).
-- ============================================================

alter view public.house_balance_view set (security_invoker = true);
alter view public.bet_summary_view   set (security_invoker = true);
alter view public.daily_pl_view      set (security_invoker = true);

alter function public.tg_set_updated_at() set search_path = public;
alter function public.house_balance(uuid, uuid) set search_path = public;

revoke execute on function public.generate_balance_snapshots(date) from public, anon, authenticated;
revoke execute on function public.tg_audit_log()                from public, anon, authenticated;
revoke execute on function public.tg_bets_emit_event()          from public, anon, authenticated;
revoke execute on function public.tg_handle_new_user()          from public, anon, authenticated;
revoke execute on function public.tg_transactions_immutable()   from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at()           from public, anon, authenticated;
