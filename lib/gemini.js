import { GoogleGenAI } from '@google/genai';
import { query } from './db.js';

/*
  Güçlü model:
  AI Koç, yanlış analizi ve daha zor muhakeme görevleri.
*/
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  'gemini-3.7-flash';

/*
  Hızlı model:
  Flashcard, Test Lab, program ve hızlı fallback.
*/
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


/*
  Hangi AI işlemlerinin doğrudan hızlı modelle
  başlaması gerektiğini burada belirliyoruz.
*/
const FAST_ACTIONS = new Set([
  'flashcards',
  'test',
  'program'
]);
/*
  Gemini ücretleri — USD / 1 milyon token.

  3.7 Flash için 31 Aralık 2026'ya kadar
  geçerli tanıtım fiyatı.
*/
const MODEL_PRICING = {
  'gemini-3.7-flash': {
    input: 0.75,
    output: 3.75
  },

  'gemini-3.5-flash-lite': {
    input: 0.30,
    output: 2.50
  }
};


function calculateCostUsd(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    console.warn(
      `[AI] pricing not found for model=${model}`
    );

    return null;
  }

  const input =
    Number(inputTokens || 0);

  const output =
    Number(outputTokens || 0);

  return (
    (input / 1_000_000) * pricing.input +
    (output / 1_000_000) * pricing.output
  );
}

/*
  Promise için gerçek bir süre sınırı.

  Bu, kullanıcıyı dakikalarca aynı istekte
  bekletmemek için kullanılıyor.
*/
function withTimeout(promise, ms) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('AI_TIMEOUT');
      err.code = 'AI_TIMEOUT';
      reject(err);
    }, ms);
  });

  return Promise.race([
    promise,
    timeout
  ]).finally(() => {
    clearTimeout(timer);
  });
}


function getStatus(err) {
  return (
    err?.status ||
    err?.code ||
    err?.response?.status ||
    null
  );
}


function isRetryable(err) {
  const status = getStatus(err);

  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 'AI_TIMEOUT'
  );
}


/*
  Tek model çağrısı.

  Burada bilinçli olarak uzun retry zinciri yok.
*/
async function generateOnce({
  ai,
  model,
  contents,
  config,
  timeoutMs
}) {
  const startedAt = Date.now();

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents,
        config
      }),
      timeoutMs
    );

    console.log(
      `[AI] success model=${model} duration=${Date.now() - startedAt}ms`
    );

    return response;

  } catch (err) {

    console.error(
      `[AI] failure model=${model} duration=${Date.now() - startedAt}ms status=${getStatus(err)}`,
      err?.message || err
    );

    throw err;
  }
}


export async function geminiText({
  userId,
  action,
  input,
  systemInstruction,
  responseSchema,
  image,
  model
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


  /*
    Basit görevlerde minimal düşünme:
    daha düşük gecikme.

    Daha karmaşık görevlerde low:
    kaliteyi tamamen öldürmeden hız kazanıyoruz.
  */
  const fastAction =
    FAST_ACTIONS.has(action);

  const config = {
    systemInstruction,
    thinkingConfig: {
      thinkingLevel:
        fastAction
          ? 'minimal'
          : 'low'
    }
  };


  if (responseSchema) {
    config.responseMimeType =
      'application/json';

    config.responseSchema =
      responseSchema;
  }


  /*
    Handler özel model verdiyse onu kullan.

    Vermediyse:
    - hızlı görev → Flash-Lite
    - diğerleri → güçlü Flash
  */
  const primaryModel =
    model ||
    (
      fastAction
        ? GEMINI_FAST_MODEL
        : GEMINI_MODEL
    );


  /*
    Primary zaten Lite ise aynı modeli tekrar
    fallback olarak çağırmayacağız.
  */
  const fallbackModel =
    primaryModel === GEMINI_FAST_MODEL
      ? null
      : GEMINI_FAST_MODEL;


  let response;
  let usedModel = primaryModel;
  let usedFallback = false;

  const totalStartedAt = Date.now();


  try {

    /*
      İlk modeli maksimum yaklaşık 12 saniye bekle.
    */
    response = await generateOnce({
      ai,
      model: primaryModel,
      contents,
      config,
      timeoutMs: 12000
    });

  } catch (primaryError) {

    /*
      4xx gibi tekrar denemenin anlamsız olduğu
      hatalarda fallback yapmıyoruz.
    */
    if (
      !fallbackModel ||
      !isRetryable(primaryError)
    ) {
      throw primaryError;
    }


    console.warn(
      `[AI] fallback action=${action} from=${primaryModel} to=${fallbackModel}`
    );

    usedFallback = true;
    usedModel = fallbackModel;


    /*
      Fallback modelini de sınırsız beklemiyoruz.
    */
    try {

      response = await generateOnce({
        ai,
        model: fallbackModel,
        contents,
        config: {
          ...config,
          thinkingConfig: {
            thinkingLevel: 'minimal'
          }
        },
        timeoutMs: 12000
      });

    } catch (fallbackError) {

      /*
        Son bir kısa retry.
        Yalnızca geçici hata ise.
      */
      if (!isRetryable(fallbackError)) {
        throw fallbackError;
      }


      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );


      response = await generateOnce({
        ai,
        model: fallbackModel,
        contents,
        config: {
          ...config,
          thinkingConfig: {
            thinkingLevel: 'minimal'
          }
        },
        timeoutMs: 10000
      });
    }
  }


  const durationMs =
    Date.now() - totalStartedAt;


  const usage =
    response?.usageMetadata || {};


  /*
    Kullanım kaydı AI cevabını kullanıcıya
    göndermeyi engellemesin.
  */
  try {

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
    );

  } catch (usageError) {

    console.warn(
      '[AI] usage log could not be saved:',
      usageError?.message || usageError
    );
  }


  const output =
    response?.text || '';


  if (!output.trim()) {
    throw new Error(
      'Gemini boş yanıt döndürdü.'
    );
  }


  console.log(
    `[AI] completed action=${action} model=${usedModel} fallback=${usedFallback} total=${durationMs}ms`
  );


  return output;
}
