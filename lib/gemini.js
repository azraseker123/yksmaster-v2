import { GoogleGenAI } from '@google/genai';
import { query } from './db.js';

export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  'gemini-3.7-flash';

function client() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });
}

export async function geminiText({
  userId,
  action,
  input,
  systemInstruction,
  responseSchema,
  image
}) {
  const ai = client();

  const contents = image
    ? [
        {
          inlineData: {
            mimeType: image.mimeType,
            data: image.data
          }
        },
        {
          text: input
        }
      ]
    : input;

  const config = {
    systemInstruction
  };

  if (responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = responseSchema;
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config
  });

  const usage = response.usageMetadata || {};

  await query(
    `INSERT INTO yks2_ai_usage(
      user_id,
      action,
      model,
      input_tokens,
      output_tokens
    )
    VALUES($1,$2,$3,$4,$5)`,
    [
      userId,
      action,
      GEMINI_MODEL,
      usage.promptTokenCount ?? null,
      usage.candidatesTokenCount ?? null
    ]
  ).catch(() => {});

  const output = response.text || '';

  if (!output) {
    throw new Error('Gemini boş yanıt döndürdü.');
  }

  return output;
}
