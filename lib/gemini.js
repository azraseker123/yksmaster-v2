import { GoogleGenAI } from '@google/genai';
import { query } from './db.js';

export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  'gemini-3.7-flash';
export const GEMINI_FAST_MODEL =
  process.env.GEMINI_FAST_MODEL ||
  'gemini-3.5-flash-lite';
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
let usedModel = model;

const tryGenerate = async (targetModel, attempts = 2) => {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await ai.models.generateContent({
        model: targetModel,
        contents,
        config
      });
    } catch (err) {
      lastError = err;

      const status =
        err?.status ||
        err?.code ||
        err?.response?.status;

      const retryable =
        status === 429 ||
        status === 408 ||
        (Number(status) >= 500 && Number(status) <= 599);

      if (!retryable || attempt === attempts) {
        throw err;
      }

      const delay =
        700 * (2 ** (attempt - 1)) +
        Math.floor(Math.random() * 300);

      await new Promise(resolve =>
        setTimeout(resolve, delay)
      );
    }
  }

  throw lastError;
};

try {
  response = await tryGenerate(model, 2);
} catch (err) {
  const status =
    err?.status ||
    err?.code ||
    err?.response?.status;

  const canFallback =
    model !== GEMINI_FAST_MODEL &&
    (
      status === 429 ||
      status === 503 ||
      (Number(status) >= 500 && Number(status) <= 599)
    );

  if (!canFallback) {
    throw err;
  }

  usedModel = GEMINI_FAST_MODEL;

  response = await tryGenerate(
    GEMINI_FAST_MODEL,
    2
  );
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
  usedModel,
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
