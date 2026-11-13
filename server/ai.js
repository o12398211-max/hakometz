// מנחה AI חכם (אופציונלי): משתמש ב-Claude אם ANTHROPIC_API_KEY מוגדר, וב-OpenAI TTS אם OPENAI_API_KEY מוגדר.
const { pick, CANNED_HOST_REACT } = require('./script');

let client = null;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic.default ? new Anthropic.default() : new Anthropic();
  } catch (e) { console.error('Anthropic SDK init failed', e.message); }
}
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const SYSTEM = `אתה המנחה של שעשועון טלוויזיה ישראלי בשם "הקומץ" (משחק היגיון שבו כל שאלה מסומנת באחוז האנשים שענו עליה נכון).
אתה חם, מצחיק, עוקצני בעדינות, בסגנון מנחה ישראלי. אתה מדבר עם מתמודד בשידור חי.
כללים: ענה בעברית בלבד, במשפט אחד או שניים קצרים (עד 25 מילים), בלי אימוג'ים, בלי סימני markdown, בלי מרכאות.
התשובה שלך תוקרא בקול על ידי מנוע דיבור, אז כתוב טבעי ודבור. אל תעליב, אל תדבר על פוליטיקה, ושמור על אווירה כיפית.
אם המתמודד אומר משהו לא ברור, צחק על זה בעדינות והמשך.`;

const enabled = () => !!client;

async function reply({ context, history }) {
  if (!client) return pick(CANNED_HOST_REACT);
  try {
    const messages = [];
    messages.push({ role: 'user', content: `הקשר: ${context}\n\nהשיחה עד עכשיו:\n${history.map(h => `${h.who}: ${h.text}`).join('\n')}\n\nמה אתה (המנחה) אומר עכשיו?` });
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages,
    }, { timeout: 12000 });
    if (res.stop_reason === 'refusal') return pick(CANNED_HOST_REACT);
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    return text || pick(CANNED_HOST_REACT);
  } catch (e) {
    console.error('AI reply failed:', e.message);
    return pick(CANNED_HOST_REACT);
  }
}

// קול משופר (OpenAI TTS) - אופציונלי
const ttsEnabled = () => !!process.env.OPENAI_API_KEY;
async function tts(text) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'ash',
      input: text.slice(0, 600),
      instructions: 'דבר בעברית ישראלית טבעית, בטון של מנחה שעשועון טלוויזיה חם, אנרגטי ודרמטי.',
      response_format: 'mp3',
    }),
  });
  if (!r.ok) throw new Error('tts ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { reply, enabled, tts, ttsEnabled };
