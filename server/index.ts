import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const port = Number(process.env.PORT || 8787);
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'skilltree-api', geminiConfigured: Boolean(process.env.GEMINI_API_KEY) }));

app.post('/api/ceo/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
  if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'أضف GEMINI_API_KEY إلى بيئة الخادم لتفعيل CEO AI.' });
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      systemInstruction: `أنت CEO مساعد داخل منصة SKILLTREE. قدم خططاً عملية ومختصرة باللغة التي يستخدمها المستخدم. لا تدّع تنفيذ أي إجراء خارجي. اطلب موافقة بشرية قبل القرارات الحساسة أو العمليات الخارجية. قسّم العمل إلى مهام قابلة للقياس.` });
    const chat = model.startChat({ history: history.map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] })) });
    const result = await chat.sendMessage(message);
    res.json({ reply: result.response.text() });
  } catch (error) {
    console.error('Gemini request failed:', error);
    res.status(502).json({ error: 'تعذر الاتصال بـ Gemini. تحقق من المفتاح واسم النموذج.' });
  }
});

app.listen(port, () => console.log(`SKILLTREE API listening on http://localhost:${port}`));
