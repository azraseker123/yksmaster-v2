import { GoogleGenAI } from '@google/genai';
import { query } from './db.js';

// Gemini 3.7 Flash is the current production-oriented Flash model in the
// Interactions API. It can be overridden from Vercel without touching code.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';

function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function geminiText({ userId, action, input, systemInstruction, responseSchema, image }) {
  const ai = client();
  const interactionInput = image ? [
    { type: 'text', text: input },
    { type: 'image', data: image.data, mime_type: image.mimeType }
  ] : input;

  const payload = {
    model: GEMINI_MODEL,
    input: interactionInput,
    system_instruction: systemInstruction,
    generation_config: { thinking_level: 'low' },
    // YKS Master does not rely on server-side Gemini conversation history.
    // Keeping this false minimizes provider-side retention for these requests.
    store: false
  };

  if (responseSchema) {
    payload.response_format = {
      type: 'text',
      mime_type: 'application/json',
      schema: responseSchema
    };
  }

  const interaction = await ai.interactions.create(payload);
  const usage = interaction.usage || {};

  await query(
    `INSERT INTO yks2_ai_usage(user_id,action,model,input_tokens,output_tokens)
     VALUES($1,$2,$3,$4,$5)`,
    [
      userId,
      action,
      GEMINI_MODEL,
      usage.total_input_tokens ?? null,
      usage.total_output_tokens ?? null
    ]
  ).catch(() => {});

  return interaction.output_text || '';
}
