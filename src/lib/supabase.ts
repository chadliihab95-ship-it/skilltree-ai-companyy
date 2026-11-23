import { createClient } from '@supabase/supabase-js';

const url = import.meta.env?.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'missing-key';

export const supabaseConfigured =
  Boolean(import.meta.env?.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env?.VITE_SUPABASE_ANON_KEY);

export const supabase = createClient(url, key);
