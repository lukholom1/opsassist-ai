
CREATE TABLE public.tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert tickets"
  ON public.tickets FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read tickets"
  ON public.tickets FOR SELECT TO anon, authenticated
  USING (true);

CREATE INDEX tickets_created_at_idx ON public.tickets (created_at DESC);
