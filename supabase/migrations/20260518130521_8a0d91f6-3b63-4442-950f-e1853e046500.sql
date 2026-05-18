REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;

-- Explicit deny-all on pending_activations (only service role bypasses RLS).
DROP POLICY IF EXISTS "Nobody can access pending activations directly" ON public.pending_activations;
CREATE POLICY "Nobody can access pending activations directly" ON public.pending_activations
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);