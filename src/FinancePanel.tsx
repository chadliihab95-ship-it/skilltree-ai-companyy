import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, RefreshCw, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { supabase } from './lib/supabase';

type Transaction = {
  id: string;
  transaction_type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  currency: string;
  transaction_date: string;
};
type Props = { organizationId: string; userId: string; role: string };
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const money = (v: number, c: string) =>
  new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 }).format(v) + ' ' + c;

export default function FinancePanel({ organizationId, userId, role }: Props) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<'income'|'expense'>('income');
  const [category, setCategory] = useState('مبيعات');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('DZD');
  const [date, setDate] = useState(today());
  const canManage = ['owner','admin','manager'].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('finance_transactions')
      .select('id,transaction_type,category,description,amount,currency,transaction_date')
      .eq('organization_id', organizationId)
      .order('transaction_date', { ascending: false });
    if (err) setError('تعذر تحميل السجلات: ' + err.message);
    else { setRows((data || []) as Transaction[]); setError(''); }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const map = new Map<string,{income:number;expense:number}>();
    rows.forEach(r => {
      const v = map.get(r.currency) || {income:0,expense:0};
      v[r.transaction_type] += Number(r.amount);
      map.set(r.currency,v);
    });
    return [...map.entries()].map(([currency,v]) => ({
      currency,...v,net:v.income-v.expense
    }));
  },[rows]);

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !description.trim() || Number(amount)<=0 || saving) return;
    setSaving(true);
    const {error:err} = await supabase.from('finance_transactions').insert({
      organization_id:organizationId,
      created_by:userId,
      transaction_type:kind,
      category:category.trim(),
      description:description.trim(),
      amount:Number(amount),
      currency,
      transaction_date:date
    });
    if (err) setError('تعذر حفظ العملية: '+err.message);
    else {
      setDescription('');
      setAmount('');
      await load();
    }
    setSaving(false);
  }

  return <div className="finance-page">
    <div className="finance-toolbar">
      <div><h2>الملخص المالي</h2><p>الإيرادات والمصروفات المسجلة فعلياً</p></div>
      <button className="finance-refresh" onClick={()=>void load()} disabled={loading}>
        <RefreshCw size={15}/> تحديث
      </button>
    </div>
    {error && <div className="finance-error">{error}</div>}
    {loading ? <div className="empty">جارٍ تحميل البيانات المالية...</div> : <>
      {totals.length ? <div className="finance-summary">
        {totals.map(t=><div className="finance-currency" key={t.currency}>
          <div className="finance-currency-head"><Wallet size={18}/><b>{t.currency}</b></div>
          <div className="finance-metrics">
            <div><small>الإيرادات</small><strong className="income-text">{money(t.income,t.currency)}</strong></div>
            <div><small>المصروفات</small><strong className="expense-text">{money(t.expense,t.currency)}</strong></div>
            <div><small>صافي الحركة المسجلة</small><strong>{money(t.net,t.currency)}</strong></div>
          </div>
        </div>)}
      </div> : <div className="empty finance-empty"><Wallet size={30}/><b>لا توجد عمليات مالية بعد</b><p>ستظهر البيانات هنا بعد تسجيل أول عملية.</p></div>}
      <section className="panel finance-records">
        <div className="panel-head"><div><h3>سجل العمليات</h3><p>{rows.length} عملية مسجلة</p></div></div>
        {rows.length ? <div className="finance-table-wrap"><table className="finance-table">
          <thead><tr><th>النوع</th><th>الوصف</th><th>التصنيف</th><th>التاريخ</th><th>المبلغ</th></tr></thead>
          <tbody>{rows.map(r=><tr key={r.id}>
            <td><span className={r.transaction_type==='income'?'income-text':'expense-text'}>
              {r.transaction_type==='income'?<ArrowUpCircle size={15}/>:<ArrowDownCircle size={15}/>}
              {r.transaction_type==='income'?'إيراد':'مصروف'}
            </span></td>
            <td>{r.description}</td><td>{r.category}</td><td>{r.transaction_date}</td>
            <td><b>{money(Number(r.amount),r.currency)}</b></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty">لا توجد سجلات لعرضها.</div>}
      </section>
    </>}
    {canManage && <section className="panel finance-form-panel">
      <div className="panel-head"><div><h3>تسجيل عملية مالية</h3><p>تُحفظ ضمن المؤسسة الحالية</p></div></div>
      <form className="finance-form" onSubmit={addTransaction}>
        <label>نوع العملية<select className="field" value={kind} onChange={e=>setKind(e.target.value as 'income'|'expense')}>
          <option value="income">إيراد</option><option value="expense">مصروف</option>
        </select></label>
        <label>التصنيف<input className="field" value={category} onChange={e=>setCategory(e.target.value)} required/></label>
        <label>الوصف<input className="field" value={description} onChange={e=>setDescription(e.target.value)} required placeholder="تفاصيل العملية"/></label>
        <label>المبلغ<input className="field" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
        <label>العملة<select className="field" value={currency} onChange={e=>setCurrency(e.target.value)}>
          <option value="DZD">DZD — دينار جزائري</option>
          <option value="EUR">EUR — يورو</option><option value="USD">USD — دولار</option>
        </select></label>
        <label>التاريخ<input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
        <button className="primary finance-submit" type="submit" disabled={saving||!description.trim()||Number(amount)<=0}>
          {saving?'جارٍ الحفظ...':'حفظ العملية'}
        </button>
      </form>
    </section>}
    {!canManage && <p className="finance-readonly">حسابك يملك صلاحية الاطلاع فقط.</p>}
  </div>;
}
