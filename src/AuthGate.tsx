import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase';
import { OrganizationProvider, type OrganizationInfo } from './lib/OrganizationContext';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [orgName, setOrgName] = useState('CARBON');
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOrganization() {
      setOrganization(null);

      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotice('');

      try {
        const { data, error } = await supabase.rpc('get_my_organization');

      if (error) throw error;

      const org = Array.isArray(data) ? data[0] : data;

      if (!org) {
        if (active) setOrganization(null);
        return;
      }

      if (active) {
        setOrganization({
          organizationId: org.organization_id,
          organizationName: org.organization_name,
          role: org.role
        });
      }
      } catch (error) {
        if (active) {
          setNotice(error instanceof Error ? error.message : 'تعذر تحميل بيانات المؤسسة.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadOrganization();

    return () => {
      active = false;
    };
  }, [session]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice('');

    try {
      const result = signup
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;

      if (signup && !result.data.session) {
        setNotice('تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد التسجيل.');
      } else {
        setNotice('تم تسجيل الدخول بنجاح.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'حدث خطأ أثناء الاتصال.');
    } finally {
      setBusy(false);
    }
  }

  async function createOrganization(e: FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;

    setBusy(true);
    setNotice('');

    try {
      const { data, error } = await supabase.rpc('bootstrap_organization', {
        p_name: orgName.trim()
      });

      if (error) throw error;

      const organizationId = data as string;

      const { data: membership, error: memberError } = await supabase
        .from('memberships')
        .select('organization_id, role')
        .eq('user_id', session.user.id)
        .eq('organization_id', organizationId)
        .single();

      if (memberError) throw memberError;

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();

      if (orgError) throw orgError;

      setOrganization({
        organizationId: membership.organization_id,
        organizationName: org.name,
        role: membership.role
      });
    } catch (error) {
      const details = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      setNotice(
        [details.message, details.details, details.hint, details.code ? `Code: ${details.code}` : '']
          .filter(Boolean)
          .join(' | ') || 'تعذر إنشاء المؤسسة.'
      );
    } finally {
      setBusy(false);
    }
  }

  const page: React.CSSProperties = {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#0c1020',
    color: '#f5f5ff',
    padding: 20,
    fontFamily: 'system-ui, sans-serif',
    direction: 'rtl'
  };

  const panel: React.CSSProperties = {
    width: '100%',
    maxWidth: 420,
    padding: 28,
    borderRadius: 20,
    background: '#171d32',
    border: '1px solid #303957',
    boxSizing: 'border-box'
  };

  const field: React.CSSProperties = {
    width: '100%',
    padding: 13,
    margin: '8px 0 16px',
    borderRadius: 10,
    border: '1px solid #414b68',
    background: '#0c1020',
    color: 'white',
    boxSizing: 'border-box'
  };

  const button: React.CSSProperties = {
    width: '100%',
    padding: 13,
    border: 0,
    borderRadius: 10,
    background: '#8b79f7',
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer'
  };

  if (!supabaseConfigured) return (
    <div style={page}>
      <div style={panel}>
        <h2>SKILLTREE — إعداد الاتصال</h2>
        <p>لم يتم العثور على إعدادات Supabase في متغيرات Vite.</p>
        <p>تأكد من VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY داخل .env ثم أعد تشغيل التطبيق.</p>
      </div>
    </div>
  );

  if (loading) return <div style={page}>جارٍ تحميل بيانات الحساب والمؤسسة...</div>;

  if (!session) return (
    <div style={page}>
      <form style={panel} onSubmit={submit}>
        <h1 style={{ marginTop: 0 }}>SKILLTREE</h1>
        <p>نظام إدارة شركتك بالذكاء الاصطناعي</p>
        <h3>{signup ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}</h3>
        <label>البريد الإلكتروني</label>
        <input style={field} type="email" required value={email}
          onChange={e => setEmail(e.target.value)} />
        <label>كلمة المرور</label>
        <input style={field} type="password" required minLength={6}
          value={password} onChange={e => setPassword(e.target.value)} />
        <button style={button} disabled={busy}>
          {busy ? 'يرجى الانتظار...' : signup ? 'إنشاء الحساب' : 'دخول'}
        </button>
        {notice && <p role="status">{notice}</p>}
        <p style={{ textAlign: 'center', marginBottom: 0 }}>
          <button type="button" onClick={() => { setSignup(!signup); setNotice(''); }}
            style={{ background: 'none', border: 0, color: '#b6aaff', padding: 12 }}>
            {signup ? 'لديك حساب؟ سجل الدخول' : 'إنشاء حساب جديد'}
          </button>
        </p>
      </form>
    </div>
  );

  if (!organization) return (
    <div style={page}>
      <form style={panel} onSubmit={createOrganization}>
        <h1 style={{ marginTop: 0 }}>CARBON</h1>
        <p>مرحباً بك. حسابك لا يرتبط بأي مؤسسة حتى الآن.</p>
        <h3>إنشاء شركتك</h3>
        <label>اسم المؤسسة</label>
        <input style={field} required minLength={2} maxLength={100}
          value={orgName} onChange={e => setOrgName(e.target.value)} />
        <button style={button} disabled={busy}>
          {busy ? 'جارٍ إنشاء الشركة...' : 'إنشاء شركة CARBON'}
        </button>
        {notice && <p role="alert">{notice}</p>}
      </form>
    </div>
  );

  return (
    <OrganizationProvider value={organization}>
      {children}
      <div style={{
        position: 'fixed', bottom: 12, left: 12, zIndex: 9998,
        padding: '8px 12px', borderRadius: 9,
        background: '#171d32', color: 'white',
        border: '1px solid #414b68', fontSize: 12
      }}>
        {organization.organizationName} · {organization.role}
      </div>
      <button onClick={() => supabase.auth.signOut()}
        style={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
          padding: '9px 14px', borderRadius: 9,
          border: '1px solid #777', background: '#171d32',
          color: 'white'
        }}>
        تسجيل الخروج
      </button>
    </OrganizationProvider>
  );
}
