import { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, BriefcaseBusiness, Check, ChevronDown, CircleHelp, Command, LayoutDashboard, Menu, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, Target, Users, X, Zap, Play, FileText, Wallet } from 'lucide-react';
import { agents, departments, type Agent, type Task } from './data';
import { useOrganization } from './lib/OrganizationContext';
import { supabase } from './lib/supabase';
import { loadOrganizationTasks, createOrganizationTask, updateOrganizationTask, type DbDepartment, type DbAgent } from './lib/taskService';
import FinancePanel from './FinancePanel';
import { apiFetch } from './lib/api';

type ChatMessage={role:'user'|'assistant';content:string};
const statusClass=(s:string)=>s==='مكتملة'?'done':s==='قيد التنفيذ'?'progress':s==='بانتظار الموافقة'?'approval':'new';

export default function App(){
 const { organizationId, organizationName, role } = useOrganization();
 const [section,setSection]=useState('overview');
 const [tasks,setTasks]=useState<Task[]>([]);
 const [departmentIds,setDepartmentIds]=useState<Record<string,string>>({});
 const [dbDepartments,setDbDepartments]=useState<DbDepartment[]>([]);
 const [dbAgents,setDbAgents]=useState<DbAgent[]>([]);
 const [userId,setUserId]=useState('');
 const [taskLoading,setTaskLoading]=useState(true);
 const [taskBusy,setTaskBusy]=useState(false);
 const [query,setQuery]=useState('');
 const [showTask,setShowTask]=useState(false);
 const [title,setTitle]=useState('');
 const [dept,setDept]=useState('strategy');
 const [priority,setPriority]=useState<Task['priority']>('متوسطة');
 const [chat,setChat]=useState<ChatMessage[]>([{role:'assistant',content:'مرحباً، أنا CEO في SKILLTREE. أخبرني بهدفك وسأحوّله إلى خطة عمل ومهام قابلة للمتابعة.'}]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [mobileNav,setMobileNav]=useState(false);
 const [notice,setNotice]=useState(''); const [executingTaskId,setExecutingTaskId]=useState(''); const [taskOutputs,setTaskOutputs]=useState<Record<string,string>>({}); const [viewOutput,setViewOutput]=useState<string|null>(null);
 useEffect(() => {
   let active = true;
   async function loadTasks() {
     setTaskLoading(true);
     try {
       const { data: { user }, error: userError } = await supabase.auth.getUser();
       if (userError) throw userError;
       if (!user) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً.');

       const result = await loadOrganizationTasks(organizationId);
       if (!active) return;

       setUserId(user.id);
       setTasks(result.tasks);
       setDepartmentIds(result.departmentIds);
       setDbDepartments(result.departments);
       setDbAgents(result.agents);
     } catch (error) {
       if (active) setNotice(error instanceof Error ? error.message : 'تعذر تحميل المهام.');
     } finally {
       if (active) setTaskLoading(false);
     }
   }
   loadTasks();
   return () => { active = false; };
 }, [organizationId]);

 const completed=tasks.filter(t=>t.status==='مكتملة').length;
 const pending=tasks.filter(t=>t.status==='بانتظار الموافقة').length;
 const filtered=useMemo(()=>tasks.filter(t=>(t.title+t.assignee+t.status).toLowerCase().includes(query.toLowerCase())),[tasks,query]);
 const viewDepartments=useMemo(()=>dbDepartments.length?dbDepartments.map(d=>{const local=departments.find(l=>l.id===d.slug);return{id:d.slug,name:d.name,en:local?.en||d.slug,icon:local?.icon||'◆',color:local?.color||'#8b79f7'}}):departments,[dbDepartments]);
 const viewAgents=useMemo<Agent[]>(()=>dbAgents.length?dbAgents.map(a=>({id:a.id,name:a.name,role:a.role,department:dbDepartments.find(d=>d.id===a.department_id)?.slug||'operations',status:(a.status==='disabled'?'idle':a.status) as Agent['status'],specialty:a.instructions||a.role})):agents,[dbAgents,dbDepartments]);
 useEffect(()=>{if(viewDepartments.length&&!viewDepartments.some(d=>d.id===dept))setDept(viewDepartments[0].id)},[viewDepartments,dept]);
 const nav: [string,string,any][]=[['overview','لوحة القيادة',LayoutDashboard],['agents','الوكلاء',Bot],['tasks','المهام',BriefcaseBusiness],['approvals','الموافقات',ShieldCheck],['activity','سجل النشاط',Activity],['finance','المالية',Wallet]];
 async function addTask(){
   if (!title.trim() || taskBusy) return;
   setTaskBusy(true);
   try {
     const task = await createOrganizationTask(
       organizationId, userId, title, dept, priority, departmentIds
     );
     setTasks(previous => [task, ...previous]);
     setTitle('');
     setShowTask(false);
     setNotice('تم حفظ المهمة في قاعدة بيانات المؤسسة.');
   } catch (error) {
     setNotice(error instanceof Error ? error.message : 'تعذر إنشاء المهمة.');
   } finally {
     setTaskBusy(false);
   }
 }
 async function updateTask(id:string,status:Task['status']){
   if (!['owner','admin','manager'].includes(role)) {
     setNotice('لا تملك صلاحية تحديث المهام.');
     return;
   }
   try {
     await updateOrganizationTask(organizationId, id, status);
     setTasks(previous => previous.map(t => t.id === id ? {...t, status} : t));
     setNotice('تم حفظ تحديث المهمة.');
   } catch (error) {
     setNotice(error instanceof Error ? error.message : 'تعذر تحديث المهمة.');
   }
 }
 
 async function executeTask(id:string){
   if(executingTaskId) return;
   if(!['owner','admin','manager'].includes(role)){
     setNotice('لا تملك صلاحية تنفيذ المهام.');
     return;
   }
   setExecutingTaskId(id);
   setTasks(previous=>previous.map(t=>t.id===id?{...t,status:'قيد التنفيذ'}:t));
   try{
     const {data:{session}}=await supabase.auth.getSession();
     if(!session) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً.');
     const response=await apiFetch('/api/tasks/'+encodeURIComponent(id)+'/execute',{
       method:'POST',
       headers:{
         'Content-Type':'application/json',
         'Authorization':'Bearer '+session.access_token
       },
       body:JSON.stringify({organizationId})
     });
     const data=await response.json();
     if(!response.ok) throw new Error(data.error||data.details||'فشل تنفيذ المهمة.');
     setTasks(previous=>previous.map(t=>t.id===id?{...t,status:'مكتملة'}:t));
     setTaskOutputs(previous=>({...previous,[id]:data.output||'لا توجد نتيجة.'}));
     setNotice('اكتملت المهمة بنجاح بواسطة '+(data.agent||'وكيل AI')+'.');
   }catch(error){
     setTasks(previous=>previous.map(t=>t.id===id?{...t,status:'جديدة'}:t));
     setNotice(error instanceof Error?error.message:'تعذر تنفيذ المهمة.');
   }finally{
     setExecutingTaskId('');
   }
 }

 async function sendCEO(){if(!message.trim()||busy)return;const prompt=message;const next=[...chat,{role:'user' as const,content:prompt}];setChat(next);setMessage('');setBusy(true);try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('انتهت جلسة الدخول.');const r=await apiFetch('/api/ceo/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({message:prompt,history:chat,organizationId})});const data=await r.json();if(!r.ok)throw new Error(data.error||'تعذر تنفيذ الطلب.');setChat(p=>[...p,{role:'assistant',content:data.reply||'حدث خطأ.'}]);if(data.createdTasks?.length){const refreshed=await loadOrganizationTasks(organizationId);setTasks(refreshed.tasks);setNotice('CEO أنشأ '+data.createdTasks.length+' مهام وحفظها في قاعدة البيانات.');}}catch(error){setChat(p=>[...p,{role:'assistant',content:error instanceof Error?error.message:'تعذر الوصول إلى الخادم.'}]);}finally{setBusy(false);}}
 const pageTitle=nav.find(n=>n[0]===section)?.[1]||'لوحة القيادة';
 return <div className="app" dir="rtl">
  <aside className={`sidebar ${mobileNav?'open':''}`}>
   <div className="brand"><div className="brand-mark"><Command size={22}/></div><div><b>SKILLTREE</b><small>AI COMPANY OS</small></div><button className="mobile-close" onClick={()=>setMobileNav(false)}><X/></button></div>
   <div className="workspace"><span className="workspace-icon">S</span><div><b>{organizationName}</b><small>مساحة العمل الرئيسية</small></div><ChevronDown size={15}/></div>
   <div className="nav-label">مساحة العمل</div>
   {nav.map(([id,label,Icon]:any)=><button key={id} className={`nav-item ${section===id?'active':''}`} onClick={()=>{setSection(id);setMobileNav(false)}}><Icon size={18}/><span>{label}</span>{id==='approvals'&&pending>0&&<em>{pending}</em>}</button>)}
   <div className="nav-label">الأقسام</div>
   {viewDepartments.map(d=><button className="dept-item" key={d.id} onClick={()=>{setSection('agents');setQuery('')}}><i style={{background:d.color}}/>{d.name}<span>{viewAgents.filter(a=>a.department===d.id).length}</span></button>)}
   <div className="sidebar-bottom"><div className="profile"><div className="avatar">IH</div><div><b>مدير الشركة</b><small>المدير التنفيذي</small></div><Settings2 size={17}/></div></div>
  </aside>
  {mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
  <main className="main">
   <header className="topbar"><button className="menu-btn" onClick={()=>setMobileNav(true)}><Menu/></button><div className="crumb">مساحة العمل <span>/</span> <b>{pageTitle}</b></div><div className="top-actions"><span className="live"><i/> النظام يعمل</span><button className="icon-btn"><CircleHelp size={18}/></button><div className="avatar small">IH</div></div></header>
   <div className="content">
    <div className="page-head"><div><div className="eyebrow">الأربعاء، 18 نوفمبر 2026 <span>•</span> نظرة عامة على الشركة</div><h1>{section==='overview'?'مرحباً بك في مركز القيادة':pageTitle}</h1><p>{section==='overview'?'راقب أداء منظومتك الذكية وأدر فرق الوكلاء من مكان واحد.':'تابع وأدر عمليات شركتك الذكية.'}</p></div>{section!=='finance'&&<button className="primary" onClick={()=>setShowTask(true)}><Plus size={17}/> مهمة جديدة</button>}</div>
    {section==='overview'&&<>
     <div className="hero"><div className="hero-glow"/><div className="hero-copy"><div className="hero-tag"><Sparkles size={14}/> مركز القيادة الذكي</div><h2>فكّر بشكل أكبر.<br/><span>دع SKILLTREE تنظم التنفيذ.</span></h2><p>سبعة أقسام متخصصة تعمل بتناغم لتحقيق أهداف شركتك.</p><button onClick={()=>setSection('agents')}>استكشف الوكلاء <span>←</span></button></div><div className="orbit"><div className="orbit-ring ring1"/><div className="orbit-ring ring2"/><div className="orbit-core"><Command size={34}/></div>{viewDepartments.map((d,i)=><div className={`orbit-node n${i%7}`} style={{'--node':d.color} as any}>{d.icon}</div>)}</div></div>
     <div className="stats"><Stat icon={<Bot/>} label="إجمالي الوكلاء" value={String(viewAgents.length)} sub={viewDepartments.length+' أقسام متخصصة'} color="violet"/><Stat icon={<BriefcaseBusiness/>} label="إجمالي المهام" value={String(tasks.length).padStart(2,'0')} sub="ضمن مساحة العمل" color="blue"/><Stat icon={<Check/>} label="المهام المكتملة" value={String(completed).padStart(2,'0')} sub="من المهام الحالية" color="green"/><Stat icon={<ShieldCheck/>} label="بانتظار الموافقة" value={String(pending).padStart(2,'0')} sub="تحتاج مراجعتك" color="orange"/></div>
     <div className="two-col"><section className="panel"><div className="panel-head"><div><h3>المهام الأخيرة</h3><p>آخر التحديثات في مساحة العمل</p></div><button className="text-btn" onClick={()=>setSection('tasks')}>عرض الكل ←</button></div><TaskRows tasks={tasks.slice(0,4)} updateTask={updateTask} executeTask={executeTask} executingTaskId={executingTaskId} taskOutputs={taskOutputs} viewOutput={setViewOutput}/></section><section className="panel"><div className="panel-head"><div><h3>الأقسام والوكلاء</h3><p>توزيع القوة التشغيلية</p></div><button className="text-btn" onClick={()=>setSection('agents')}>عرض الكل ←</button></div><div className="dept-list">{viewDepartments.map(d=><div className="dept-row" key={d.id}><div className="dept-symbol" style={{color:d.color,background:d.color+'18'}}>{d.icon}</div><div className="dept-name"><b>{d.name}</b><small>{d.en}</small></div><div className="mini-bar"><i style={{width:'100%',background:d.color}}/></div><b className="count">{viewAgents.filter(a=>a.department===d.id).length}</b></div>)}</div></section></div>
    </>}
    {section==='agents'&&<section className="panel"><div className="panel-head"><div><h3>شبكة الوكلاء الذكية</h3><p>{viewAgents.length} وكيلاً موزعين على {viewDepartments.length} أقسام</p></div><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث عن وكيل..."/></div></div><div className="agent-grid">{viewAgents.filter(a=>(a.name+a.specialty).includes(query)).map(a=><div className="agent-card"><div className="agent-top"><div className="agent-avatar"><Bot size={20}/></div><span className={`agent-status ${a.status}`}>{a.status==='online'?'متصل':a.status==='busy'?'يعمل':'خامل'}</span></div><b>{a.name}</b><small>{viewDepartments.find(d=>d.id===a.department)?.name}</small><p>{a.specialty}</p><div className="agent-foot"><span>#{a.id.length>12?a.id.slice(0,8):a.id}</span><span>ملف الوكيل ↗</span></div></div>)}</div></section>}
    {section==='tasks'&&<section className="panel"><div className="panel-head"><div><h3>إدارة المهام</h3><p>أنشئ المهام وتابع مراحل التنفيذ</p></div><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث في المهام..."/></div></div><TaskRows tasks={filtered} updateTask={updateTask} executeTask={executeTask} executingTaskId={executingTaskId} taskOutputs={taskOutputs} viewOutput={setViewOutput}/></section>}
    {section==='approvals'&&<section className="panel"><div className="panel-head"><div><h3>مركز الموافقات البشرية</h3><p>الإجراءات الحساسة تتطلب موافقتك قبل التنفيذ</p></div><span className="approval-pill">{pending} بانتظار المراجعة</span></div>{tasks.filter(t=>t.status==='بانتظار الموافقة').length? <TaskRows tasks={tasks.filter(t=>t.status==='بانتظار الموافقة')} updateTask={updateTask} executeTask={executeTask} executingTaskId={executingTaskId} taskOutputs={taskOutputs} viewOutput={setViewOutput} approval/>:<div className="empty"><ShieldCheck size={32}/><b>لا توجد موافقات معلقة</b><p>ستظهر هنا الإجراءات التي تحتاج إلى مراجعتك.</p></div>}</section>}
    {section==='finance'&&<FinancePanel organizationId={organizationId} userId={userId} role={role}/>}{section==='activity'&&<section className="panel"><div className="panel-head"><div><h3>سجل النشاط</h3><p>أحدث التغييرات في مساحة العمل الحالية</p></div></div><div className="activity-list">{tasks.map(t=><div className="activity-row"><span className="activity-dot"/><div><b>{t.title}</b><p>تم تسجيل المهمة · {t.assignee} · {t.createdAt}</p></div><span className={`status ${statusClass(t.status)}`}>{t.status}</span></div>)}</div></section>}
    <footer>SKILLTREE AI COMPANY <span>•</span> إصدار تجريبي 1.0 <span>•</span> جميع الحقوق محفوظة</footer>
   </div>
  </main>
  <aside className="ceo-panel"><div className="ceo-head"><div className="ceo-avatar"><Sparkles size={19}/></div><div><b>CEO Assistant</b><small><i/> مساعد الشركة الذكي</small></div><span className="ceo-badge">AI</span></div><div className="ceo-intro"><div className="ceo-orb"><Zap size={23}/></div><h3>كيف أستطيع مساعدتك؟</h3><p>أنا هنا لتنسيق العمل بين الأقسام وتحويل أفكارك إلى خطوات واضحة.</p></div><div className="suggestions"><button onClick={()=>setMessage('ضع خطة نمو عملية للشركة خلال 30 يوماً.')}> <Target size={14}/> خطة نمو لمدة 30 يوماً</button><button onClick={()=>setMessage('حلّل أولويات المهام واقترح ترتيب التنفيذ.')}> <Activity size={14}/> تحليل الأولويات</button><button onClick={()=>setMessage('اقترح توزيعاً للمهام على الأقسام السبعة.')}> <Users size={14}/> توزيع المهام</button></div><div className="chat-log">{chat.map((m,i)=><div className={`bubble ${m.role}`} key={i}>{m.content}</div>)}{busy&&<div className="bubble assistant typing">يفكر CEO...</div>}</div><div className="chat-compose"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendCEO()} placeholder="اكتب توجيهاً للـ CEO..."/><button onClick={sendCEO} disabled={busy||!message.trim()}><Send size={16}/></button></div><div className="ceo-foot"><ShieldCheck size={13}/> القرارات الخارجية تتطلب موافقة بشرية</div></aside>
  {showTask&&<div className="modal-backdrop" onClick={()=>setShowTask(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h3>إنشاء مهمة جديدة</h3><p>أضف مهمة إلى فريقك</p></div><button className="icon-btn" onClick={()=>setShowTask(false)}><X/></button></div><label>عنوان المهمة</label><input className="field" value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: إعداد خطة التسويق"/><label>القسم المسؤول</label><select className="field" value={dept} onChange={e=>setDept(e.target.value)}>{viewDepartments.map(d=><option value={d.id}>{d.name}</option>)}</select><label>الأولوية</label><select className="field" value={priority} onChange={e=>setPriority(e.target.value as any)}><option>عالية</option><option>متوسطة</option><option>منخفضة</option></select><button className="primary full" onClick={addTask} disabled={!title.trim()||taskBusy}><Plus size={16}/> إنشاء المهمة</button></div></div>}
  {viewOutput!==null&&<div className="modal-backdrop" onClick={()=>setViewOutput(null)}><div className="modal output-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h3>نتيجة تنفيذ الوكيل</h3><p>المخرجات المحفوظة لهذه المهمة</p></div><button className="icon-btn" onClick={()=>setViewOutput(null)}><X/></button></div><div className="output-content">{viewOutput}</div><button className="primary full" onClick={()=>setViewOutput(null)}>إغلاق</button></div></div>}{notice&&<div className="toast" onClick={()=>setNotice('')}>{notice}</div>}
 </div>;
}
function Stat({icon,label,value,sub,color}:any){return <div className="stat"><div className={`stat-icon ${color}`}>{icon}</div><div><small>{label}</small><strong>{value}</strong><p>{sub}</p></div></div>}
function TaskRows({tasks,updateTask,approval=false,executeTask,executingTaskId,taskOutputs,viewOutput}:any){
 return <div className="task-list">{tasks.length?tasks.map((t:Task)=><div className="task-row" key={t.id}>
   <div className="task-check"><span/></div>
   <div className="task-info"><b>{t.title}</b><small>{t.id} <span>·</span> {t.assignee}</small></div>
   <span className={`priority ${t.priority==='عالية'?'high':t.priority==='متوسطة'?'medium':'low'}`}>{t.priority}</span>
   <span className={`status ${statusClass(t.status)}`}>{t.status}</span>
   <select aria-label="تحديث حالة المهمة" value={t.status} onChange={e=>updateTask(t.id,e.target.value)}><option>جديدة</option><option>قيد التنفيذ</option><option>بانتظار الموافقة</option><option>مكتملة</option></select>
   <div className="task-actions">
     {t.status==='جديدة'&&<button className="task-action execute" onClick={()=>executeTask(t.id)} disabled={!!executingTaskId}><Play size={13}/>{executingTaskId===t.id?'ينفذ...':'تنفيذ AI'}</button>}
     {taskOutputs?.[t.id]&&<button className="task-action result" onClick={()=>viewOutput(taskOutputs[t.id])}><FileText size={13}/>النتيجة</button>}
   </div>
   {approval&&<span className="approval-note">مراجعة بشرية</span>}
 </div>):<div className="empty">لا توجد مهام لعرضها.</div>}</div>
}
