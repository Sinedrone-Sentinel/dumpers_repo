-- Notifications are ephemeral: dismiss = delete, no read history kept.

DELETE FROM public.user_notifications WHERE read_at IS NOT NULL;

DROP POLICY IF EXISTS "user_notifications_delete_own" ON public.user_notifications;
CREATE POLICY "user_notifications_delete_own"
  ON public.user_notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
