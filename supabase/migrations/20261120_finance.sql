CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  transaction_type text NOT NULL CHECK (transaction_type IN ('income','expense')),
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'DZD',
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_transactions_org_date_idx
ON public.finance_transactions (organization_id, transaction_date DESC);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_transactions_read ON public.finance_transactions;
CREATE POLICY finance_transactions_read
ON public.finance_transactions
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS finance_transactions_insert ON public.finance_transactions;
CREATE POLICY finance_transactions_insert
ON public.finance_transactions
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(organization_id, ARRAY['owner','admin','manager'])
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS finance_transactions_update ON public.finance_transactions;
CREATE POLICY finance_transactions_update
ON public.finance_transactions
FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, ARRAY['owner','admin','manager']))
WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','manager']));

GRANT SELECT, INSERT, UPDATE ON public.finance_transactions TO authenticated;
