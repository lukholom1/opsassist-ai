ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Open';

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('Open', 'In Progress', 'Resolved'));

DROP POLICY IF EXISTS "Anyone can update tickets" ON public.tickets;
CREATE POLICY "Anyone can update tickets"
  ON public.tickets
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);