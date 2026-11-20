import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const port = Number(process.env.PORT || 8787);
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,capacitor://localhost,http://localhost,https://localhost').split(',').map(v => v.trim()).filter(Boolean);

const FREE_GEMINI_MODEL = 'gemini-3.5-flash-lite';

function getFreeGeminiModel(): string {
  const configured = String(process.env.GEMINI_MODEL || '').trim();
  if (configured !== FREE_GEMINI_MODEL) {
    throw new Error(
      `النموذج غير معتمد ضمن سياسة المجاني فقط. النموذج المسموح: ${FREE_GEMINI_MODEL}`
    );
  }
  return configured;
}


type AIResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

function getSelectedAIModel(): string {
  const provider = String(process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();

  if (provider === 'gemini') return getFreeGeminiModel();

  if (provider === 'deepseek') {
    if (process.env.DEEPSEEK_ENABLED !== 'true') {
      throw new Error('DeepSeek معطل. يتطلب تفعيلًا وموافقة صريحة.');
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('مفتاح DeepSeek غير مضبوط.');
    }
    return String(process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim();
  }

  throw new Error('مزود الذكاء الاصطناعي غير مدعوم.');
}

async function generateAI(options: {
  systemInstruction: string;
  prompt: string;
  history?: any[];
  json?: boolean;
}): Promise<AIResult> {
  const provider = String(process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  const modelName = getSelectedAIModel();

  if (provider === 'deepseek') {
    const messages: any[] = [
      { role: 'system', content: options.systemInstruction },
      ...(options.history || []).map((m: any) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: String(m.parts?.map((part: any) => part.text || '').join('\n') || '')
      })),
      { role: 'user', content: options.prompt }
    ];

    const response = await fetch(
      process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          ...(options.json ? { response_format: { type: 'json_object' } } : {})
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${detail.slice(0, 500)}`);
    }

    const data: any = await response.json();
    const usage = data.usage || {};
    return {
      text: String(data.choices?.[0]?.message?.content || '').trim(),
      inputTokens: Number(usage.prompt_tokens || 0),
      outputTokens: Number(usage.completion_tokens || 0),
      totalTokens: Number(usage.total_tokens || 0),
      model: modelName
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('مفتاح Gemini غير مضبوط.');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(options.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    systemInstruction: options.systemInstruction
  });

  const result = await model.startChat({
    history: options.history || []
  }).sendMessage(options.prompt);

  const usage = result.response.usageMetadata;
  return {
    text: result.response.text().trim(),
    inputTokens: Number(usage?.promptTokenCount || 0),
    outputTokens: Number(usage?.candidatesTokenCount || 0),
    totalTokens: Number(usage?.totalTokenCount || 0),
    model: modelName
  };
}

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '30kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'skilltree-api', geminiConfigured: Boolean(process.env.GEMINI_API_KEY), authConfigured: Boolean(supabaseUrl && supabaseKey) }));

app.post('/api/ceo/chat', async (req, res) => {
  const token = (req.headers.authorization || '').startsWith('Bearer ') ? String(req.headers.authorization).slice(7).trim() : '';
  const organizationId = String(req.body?.organizationId || '');
  const message = String(req.body?.message || '').trim();
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: 'إعداد التحقق غير مكتمل.' });
  if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة.' });
  if (message.length > 8000) return res.status(400).json({ error: 'الرسالة طويلة جداً.' });
  if (!organizationId) return res.status(400).json({ error: 'مساحة العمل غير محددة.' });
  

  try {
    const auth = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await auth.auth.getUser(token);
    if (authError || !userData.user) return res.status(401).json({ error: 'جلسة غير صالحة. سجّل الدخول مجدداً.' });

    const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: membership, error: memberError } = await db.from('memberships').select('role').eq('organization_id', organizationId).eq('user_id', userData.user.id).maybeSingle();
    console.error('[CEO membership diagnostic]', { userId: userData.user.id, organizationId, code: memberError?.code, error: memberError?.message, hasMembership: Boolean(membership), role: membership?.role });
    if (memberError || !membership) return res.status(403).json({ error: 'ليس لديك صلاحية الوصول إلى مساحة العمل هذه.' });

    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return res.status(403).json({ error: 'استخدام شات الرئيس التنفيذي مسموح فقط للمديرين والملاك.' });
    }

    const { data: deptRows, error: deptError } = await db.from('departments').select('id,name,slug').eq('organization_id', organizationId);
    if (deptError) throw deptError;
    const departments = deptRows || [];
    const { data: taskRows, error: taskReadError } = await db
      .from('tasks')
      .select('id,title,description,priority,status,department_id,agent_id')
      .eq('organization_id', organizationId)
      .limit(20);
    console.error('[CEO tasks diagnostic]', {
      organizationId,
      count: taskRows?.length ?? 0,
      errorCode: taskReadError?.code,
      error: taskReadError?.message
    });
    if (taskReadError) throw taskReadError;
    const existingTasksContext = (taskRows || []).map((t:any) => ({
      id: t.id,
      title: t.title,
      description: String(t.description || '').slice(0,500),
      priority: t.priority,
      status: t.status,
      department: departments.find((d:any) => d.id === t.department_id)?.name || 'غير معروف',
      agent_id: t.agent_id
    }));
    const executeIntent = /(?:ابدأ|باشر|نفذ|نفّذ|أنشئ.{0,20}مهام|حوّل.{0,30}مهام|وزع.{0,20}مهام|كلف.{0,20}الأقسام|اعمل.{0,20}مهام)/i.test(message);

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];
    const history:any[] = [];
    for (const m of rawHistory) {
      if (!m || !['user', 'assistant'].includes(m.role)) continue;
      const role = m.role === 'assistant' ? 'model' : 'user';
      const content = String(m.content || '').slice(0,3000).trim();
      if (!content) continue;
      const last = history[history.length - 1];
      if (last && last.role === role) last.parts[0].text += '\n' + content;
      else history.push({ role, parts: [{ text: content }] });
    }
    while (history.length && history[0].role !== 'user') history.shift();
    while (history.length && history[history.length - 1].role === 'user') history.pop();

    const result = await generateAI({
      systemInstruction: `أنت CEO لشركة SKILLTREE AI COMPANY. تحدث بالعربية الواضحة وباختصار.
أنت تخطط وتنسق العمل. الأقسام المتاحة حصراً: ${departments.map((d:any)=>d.slug+': '+d.name).join('، ')}.
أعد JSON فقط بالشكل: {"reply":"رد للمستخدم","tasks":[{"title":"عنوان مهمة واضح","department":"slug من الأقسام","priority":"low|medium|high|urgent","description":"نتيجة مطلوبة وخطوات مختصرة"}]}.
إذا كان المستخدم يطلب نصيحة أو خطة فقط، لا تقترح إنشاء مهام داخل tasks واجعلها []. إذا طلب التنفيذ أو إنشاء/توزيع المهام، أنشئ حتى 5 مهام عملية، ولا تنشئ مهام وهمية أو غير مرتبطة بهدفه.
لا تدّع أن مهام أُنشئت. لا تنفذ عمليات خارجية أو حساسة. لا تطلب مفاتيح أو كلمات مرور. اذكر المخاطر والميزانية المحدودة عند الحاجة.`,
      history,
      prompt: message + '\n\nبيانات المهام الحقيقية الحالية من قاعدة البيانات (للاطلاع والتحقق فقط، لا تعتبرها منجزة دون دليل):\n' + JSON.stringify(existingTasksContext),
      json: true
    });

    const usage = result;
    const { error: usageLogError } = await db
      .from('ai_usage_events')
      .insert({
        organization_id: organizationId,
        user_id: userData.user.id,
        source: 'ceo_chat',
        model: result.model,
        input_tokens: Number(usage.inputTokens || 0),
        output_tokens: Number(usage.outputTokens || 0),
        total_tokens: Number(usage.totalTokens || 0),
        billing_tier: 'unknown'
      });

    if (usageLogError) {
      console.error('[CEO usage logging failed]', usageLogError.message);
    }

    const raw = result.text;
    let parsed:any;
    try { parsed = JSON.parse(raw); } catch { parsed = { reply: raw, tasks: [] }; }
    let createdTasks:any[] = [];

    if (executeIntent && Array.isArray(parsed.tasks)) {
      for (const t of parsed.tasks.slice(0,5)) {
        const department = departments.find((d:any) => d.slug === t.department);
        const title = String(t.title || '').trim().slice(0,200);
        if (!department || !title) continue;
        const priority = ['low','medium','high','urgent'].includes(t.priority) ? t.priority : 'medium';
        const { data: inserted, error } = await db.from('tasks').insert({
          organization_id: organizationId, department_id: department.id,
          created_by: userData.user.id, title, description: String(t.description || '').slice(0,3000),
          priority, status: 'new'
        }).select('id,title').single();
        if (error) { console.error('CEO task insert:', error.message); continue; }
        createdTasks.push(inserted);
        await db.from('activity_logs').insert({
          organization_id: organizationId, actor_id: userData.user.id,
          event_type: 'ceo_task_created', entity_type: 'task', entity_id: inserted.id,
          details: { title, department: department.slug, source: 'CEO AI' }
        });
      }
    }
    let reply = String(parsed.reply || 'تم إعداد الرد.').slice(0,12000);
    if (createdTasks.length) reply += '\\n\\n✅ تم إنشاء ' + createdTasks.length + ' مهام حقيقية في قاعدة البيانات.';
    else if (executeIntent) reply += '\\n\\nلم يتم إنشاء مهام؛ لم أجد مهام صالحة مرتبطة بالأقسام الحالية.';
    return res.json({ reply, createdTasks, userId: userData.user.id });
  } catch (error) {
    console.error('CEO chat error:', error);
    return res.status(502).json({ error: 'تعذر على CEO الرد حالياً. تحقق من إعدادات الخادم.' });
  }
});


app.post('/api/tasks/:taskId/execute', async (req, res) => {
  const token = (req.headers.authorization || '').startsWith('Bearer ')
    ? String(req.headers.authorization).slice(7).trim()
    : '';
  const organizationId = String(req.body?.organizationId || '');
  const taskId = String(req.params.taskId || '');

  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  if (!organizationId) return res.status(400).json({ error: 'المؤسسة غير محددة.' });
  

  let db: any;
  let runId: string | null = null;
  let claimed = false;

  try {
    const auth = createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userData, error: authError } = await auth.auth.getUser(token);
    if (authError || !userData.user) {
      return res.status(401).json({ error: 'جلسة غير صالحة.' });
    }

    db = createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer ' + token } }
    });

    const { data: membership, error: membershipError } = await db
      .from('memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return res.status(403).json({ error: 'لا تملك صلاحية الوصول للمؤسسة.' });
    }

    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return res.status(403).json({ error: 'تنفيذ المهام مسموح فقط للمديرين والملاك.' });
    }

    const { data: task, error: taskError } = await db
      .from('tasks')
      .select('id,title,description,priority,status,department_id,agent_id')
      .eq('id', taskId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    if (task.status !== 'new') {
      return res.status(409).json({ error: 'لا يمكن تنفيذ المهمة. يجب أن تكون حالتها جديدة.' });
    }

    // Atomic claim: prevents two requests from claiming the same task.
    const { data: claimedTask, error: claimError } = await db
      .from('tasks')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('organization_id', organizationId)
      .eq('status', 'new')
      .select('id')
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimedTask) return res.status(409).json({ error: 'المهمة استلمها تنفيذ آخر.' });
    claimed = true;

    const { data: department } = await db
      .from('departments')
      .select('name,slug')
      .eq('id', task.department_id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    let agentName = 'وكيل القسم';
    if (task.agent_id) {
      const { data: agent } = await db
        .from('agents')
        .select('name')
        .eq('id', task.agent_id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (agent?.name) agentName = agent.name;
    }

    const modelName = getSelectedAIModel();

    const { data: run, error: runInsertError } = await db
      .from('task_runs')
      .insert({
        organization_id: organizationId,
        task_id: taskId,
        agent_id: task.agent_id,
        status: 'running',
        input: {
          title: task.title,
          description: task.description || '',
          priority: task.priority,
          department: department?.slug || 'general',
          agent: agentName
        },
        model: modelName,
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (runInsertError) throw runInsertError;
    runId = run.id;

    const agentSystemInstruction = `أنت وكيل ذكاء اصطناعي تنفيذي في شركة SKILLTREE AI COMPANY.
اسم الوكيل: ${agentName}.
القسم: ${department?.name || department?.slug || 'عام'}.
نفذ المهمة بدقة وبشكل عملي. أخرج نتيجة قابلة للاستخدام، منظمة وواضحة باللغة العربية.
لا تدّع أنك نفذت أعمالاً خارجية أو عمليات لم تقم بها فعلياً.
إذا كانت المهمة تتطلب معلومات غير متوفرة، اذكر الافتراضات والنواقص والمخاطر بوضوح.
لا تطلب كلمات مرور أو مفاتيح سرية.`;

    const prompt = `المهمة: ${task.title}
الأولوية: ${task.priority}
التعليمات والتفاصيل:
${task.description || 'لا توجد تفاصيل إضافية.'}

نفّذ المهمة وأعد النتيجة النهائية، مع الخطوات أو التوصيات اللازمة.`;

    const result = await generateAI({
      systemInstruction: agentSystemInstruction,
      prompt
    });
    
const inputTokens = result.inputTokens;
const outputTokens = result.outputTokens;
const totalTokens = result.totalTokens;

    const output = result.text;
    
const { error: usageError } = await db
  .from('task_runs')
  .update({
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens
  })
  .eq('id', runId)
  .eq('organization_id', organizationId);
if (usageError) throw usageError;

    const { error: agentUsageError } = await db
      .from('ai_usage_events')
      .insert({
        organization_id: organizationId,
        user_id: userData.user.id,
        source: 'agent_task',
        model: modelName,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        billing_tier: 'unknown'
      });

    if (agentUsageError) {
      console.error('[Agent usage logging failed]', agentUsageError.message);
    }


    if (!output) throw new Error('الوكيل لم يُرجع نتيجة.');

    const { error: runUpdateError } = await db
      .from('task_runs')
      .update({
        status: 'completed',
        output,
        completed_at: new Date().toISOString()
      })
      .eq('id', runId)
      .eq('organization_id', organizationId);

    if (runUpdateError) throw runUpdateError;

    const { error: taskUpdateError } = await db
      .from('tasks')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('organization_id', organizationId)
      .eq('status', 'running');

    if (taskUpdateError) throw taskUpdateError;

    await db.from('activity_logs').insert({
      organization_id: organizationId,
      actor_id: userData.user.id,
      event_type: 'task_execution_completed',
      entity_type: 'task',
      entity_id: taskId,
      details: { title: task.title, agent: agentName, run_id: runId }
    });

    return res.json({
      success: true,
      taskId,
      runId,
      agent: agentName,
      output
    });
  } catch (error: any) {
    console.error('Task execution error:', error?.message || error);

    if (db && runId) {
      await db.from('task_runs').update({
        status: 'failed',
        error: String(error?.message || error).slice(0, 3000),
        completed_at: new Date().toISOString()
      }).eq('id', runId).eq('organization_id', organizationId);
    }

    if (db && claimed) {
      await db.from('tasks').update({
        status: 'new',
        updated_at: new Date().toISOString()
      }).eq('id', taskId).eq('organization_id', organizationId).eq('status', 'running');
    }

    return res.status(500).json({
      error: 'فشل تنفيذ المهمة.',
      details: String(error?.message || error).slice(0, 500)
    });
  }
});

app.listen(port, '0.0.0.0', () => console.log('SKILLTREE API listening on 0.0.0.0:' + port));
