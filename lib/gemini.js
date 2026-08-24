import { GoogleGenAI } from '@google/genai';
import { query } from './db.js';

export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  'gemini-3.7-flash';

export const GEMINI_FAST_MODEL =
  process.env.GEMINI_FAST_MODEL ||
  'gemini-3.5-flash-lite';

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
  image,
  model = GEMINI_MODEL
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
  systemInstruction,
  thinkingConfig: {
    thinkingLevel: 'low'
  }
};

  if (responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = responseSchema;
  }

 let response;

const maxAttempts = 4;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config
    });

    break;

  } catch (err) {
    const status =
      err?.status ||
      err?.code ||
      err?.response?.status;

    const retryable =
      status === 429 ||
      status === 408 ||
      (Number(status) >= 500 && Number(status) <= 599);

    if (!retryable || attempt === maxAttempts) {
      throw err;
    }

    const baseDelay = 1000 * (2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * 500);
    const delay = baseDelay + jitter;

    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

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
