import { GoogleGenAI } from '@google/genai';

import {
  query,
  db
} from './db.js';

/*
  Güçlü model:
  AI Koç, yanlış analizi, deneme analizi
  ve daha zor muhakeme görevleri.
*/
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  'gemini-3.7-flash';

/*
  Hızlı model:
  Flashcard, Test Lab, program
  ve hızlı fallback.
*/
export const GEMINI_FAST_MODEL =
  process.env.GEMINI_FAST_MODEL ||
  'gemini-3.5-flash-lite';


function client() {
  if (
    !process.env.GEMINI_API_KEY
  ) {
    throw new Error(
      'GEMINI_API_KEY is missing'
    );
  }

  return new GoogleGenAI({
    apiKey:
      process.env.GEMINI_API_KEY
  });
}


/*
  Doğrudan hızlı modelle başlaması
  gereken işlemler.
*/
const FAST_ACTIONS =
  new Set([
    'flashcards',
    'test',
    'program'
  ]);


/*
  AI kullanım kotaları.

  Gerçek kota kontrolü usage reservation ile
  aynı transaction içinde yapılır.

  Böylece aynı kullanıcıdan aynı anda gelen
  iki istek kota kontrolünü birlikte geçemez.
*/
export const DAILY_LIMITS = Object.freeze({
  coach: 25,
  flashcards: 15,
  test: 10,
  program: 5,
  wrong_analysis: 5,
  solve_image: 25,
  recovery: 3,
  exam_analysis: 5
});

export const MONTHLY_LIMITS = Object.freeze({
  coach: 100,
  flashcards: 40,
  test: 30,
  program: 8,
  wrong_analysis: 10,
  solve_image: 100,
  recovery: 10,
  exam_analysis: 10
});


const ACTION_NAMES = Object.freeze({
  coach: 'AI Koç',
  flashcards: 'Flashcard',
  test: 'Test Lab',
  program: 'AI Çalışma Programı',
  wrong_analysis: 'Yanlış Analizi',
  solve_image: 'Fotoğraftan Soru Çözümü',
  recovery: 'Beni Toparla',
  exam_analysis: 'Deneme Analizi'
});


/*
  USD / 1 milyon token.

  Fiyatlar değişebileceği için
  lansman öncesi resmi Gemini fiyatlarıyla
  ayrıca karşılaştırılmalı.
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


/*
  Kullanıcı başına maliyet güvenliği.

  3.00 USD teorik bütçe.
  2.90 USD'de yeni isteği durduruyoruz.
  Her yeni istek önce 0.10 USD rezerv koyar.
*/
const AI_COST_SAFETY = {
  monthlyBudgetUsd: 3.00,
  stopAtUsd: 2.90,
  reservePerRequestUsd: 0.10
};


function calculateCostUsd(
  model,
  inputTokens,
  outputTokens
) {
  const pricing =
    MODEL_PRICING[model];

  if (!pricing) {
    console.warn(
      `[AI] pricing not found for model=${model}`
    );

    /*
      Fiyatı bilinmeyen modeli 0 maliyet
      kabul etmek tehlikeli olur.

      En az rezerv miktarını koruyoruz.
    */
    return AI_COST_SAFETY
      .reservePerRequestUsd;
  }

  const input =
    Math.max(
      0,
      Number(
        inputTokens || 0
      )
    );

  const output =
    Math.max(
      0,
      Number(
        outputTokens || 0
      )
    );

  const cost =
    (
      input /
      1_000_000
    ) *
    pricing.input +
    (
      output /
      1_000_000
    ) *
    pricing.output;

  if (
    !Number.isFinite(cost) ||
    cost < 0
  ) {
    return AI_COST_SAFETY
      .reservePerRequestUsd;
  }

  return cost;
}


/*
  İstanbul ay sınırlarıyla toplam maliyet.
*/
async function getMonthlyAiCostUsd(
  userId
) {
  if (!userId) {
    return 0;
  }

  const result =
    await query(
      `
      SELECT
        COALESCE(
          SUM(cost_usd),
          0
        ) AS total_cost_usd

      FROM yks2_ai_usage

      WHERE user_id = $1

        AND created_at >= (
          date_trunc(
            'month',
            NOW()
              AT TIME ZONE
              'Europe/Istanbul'
          )
          AT TIME ZONE
          'Europe/Istanbul'
        )

        AND created_at < (
          (
            date_trunc(
              'month',
              NOW()
                AT TIME ZONE
                'Europe/Istanbul'
            )
            + INTERVAL '1 month'
          )
          AT TIME ZONE
          'Europe/Istanbul'
        )
      `,
      [userId]
    );

  return Number(
    result.rows?.[0]
      ?.total_cost_usd ||
    0
  );
}


/*
  Yeni AI isteği başlamadan önce:

  1. Kullanıcı bazlı DB kilidi al.
  2. Günlük kotayı kontrol et.
  3. Aylık kotayı kontrol et.
  4. Maliyet sınırını kontrol et.
  5. Kullanım rezervasyonunu oluştur.

  Bunların tamamı aynı kısa transaction içinde.

  Böylece aynı kullanıcıdan eşzamanlı gelen iki
  istek kota ve maliyet kontrolünü birlikte geçemez.
*/
async function reserveAiCost({
  userId,
  action,
  model
}) {
  if (!userId) {
    throw new Error(
      'AI userId missing'
    );
  }

  const client =
    await db.connect();

  try {
    await client.query(
      'BEGIN'
    );

    /*
      Kullanıcı bazında transaction kilidi.
    */
    await client.query(
      `
      SELECT
        pg_advisory_xact_lock(
          $1::bigint
        )
      `,
      [userId]
    );


    /*
      Kullanıcının rolünü DB'den oku.

      Admin günlük ve aylık özellik kotasına
      tabi değildir.

      Ancak maliyet güvenlik sınırı admin için
      de geçerli kalır.
    */
    const userResult =
      await client.query(
        `
        SELECT role
        FROM yks2_users
        WHERE id = $1
        LIMIT 1
        `,
        [userId]
      );

    const role =
      userResult.rows?.[0]?.role ||
      'user';


    /*
      Admin değilse günlük ve aylık kullanım
      kotalarını atomik şekilde kontrol et.
    */
    if (role !== 'admin') {
      const dailyLimit =
        DAILY_LIMITS[action];

      const monthlyLimit =
        MONTHLY_LIMITS[action];


      /*
        GÜNLÜK KOTA
      */
      if (dailyLimit) {
        const dailyResult =
          await client.query(
            `
            SELECT
              COUNT(*)::int AS count

            FROM yks2_ai_usage

            WHERE user_id = $1
              AND action = $2

              AND created_at >= (
                date_trunc(
                  'day',
                  NOW()
                    AT TIME ZONE
                    'Europe/Istanbul'
                )
                AT TIME ZONE
                'Europe/Istanbul'
              )

              AND created_at < (
                (
                  date_trunc(
                    'day',
                    NOW()
                      AT TIME ZONE
                      'Europe/Istanbul'
                  )
                  + INTERVAL '1 day'
                )
                AT TIME ZONE
                'Europe/Istanbul'
              )
            `,
            [
              userId,
              action
            ]
          );

        const dailyUsed =
          Number(
            dailyResult.rows?.[0]
              ?.count ||
            0
          );

        if (
          dailyUsed >=
          dailyLimit
        ) {
          await client.query(
            'ROLLBACK'
          );

          const err =
            new Error(
              'Günlük AI kullanım sınırına ulaştın. Yarın yeniden kullanabilirsin.'
            );

          err.status = 429;
          err.code = 'AI_LIMIT';

          throw err;
        }
      }


      /*
        AYLIK KOTA
      */
      if (monthlyLimit) {
        const monthlyResult =
          await client.query(
            `
            SELECT
              COUNT(*)::int AS count

            FROM yks2_ai_usage

            WHERE user_id = $1
              AND action = $2

              AND created_at >= (
                date_trunc(
                  'month',
                  NOW()
                    AT TIME ZONE
                    'Europe/Istanbul'
                )
                AT TIME ZONE
                'Europe/Istanbul'
              )

              AND created_at < (
                (
                  date_trunc(
                    'month',
                    NOW()
                      AT TIME ZONE
                      'Europe/Istanbul'
                  )
                  + INTERVAL '1 month'
                )
                AT TIME ZONE
                'Europe/Istanbul'
              )
            `,
            [
              userId,
              action
            ]
          );

        const monthlyUsed =
          Number(
            monthlyResult.rows?.[0]
              ?.count ||
            0
          );

        if (
          monthlyUsed >=
          monthlyLimit
        ) {
          await client.query(
            'ROLLBACK'
          );

          const err =
            new Error(
              `${ACTION_NAMES[action] || 'Bu özellik'} için aylık ${monthlyLimit} kullanım hakkını doldurdun.`
            );

          err.status = 429;
          err.code = 'AI_LIMIT';

          throw err;
        }
      }
    }


    /*
      AYLIK MALİYET KONTROLÜ
    */
    const totalResult =
      await client.query(
        `
        SELECT
          COALESCE(
            SUM(cost_usd),
            0
          ) AS total_cost_usd

        FROM yks2_ai_usage

        WHERE user_id = $1

          AND created_at >= (
            date_trunc(
              'month',
              NOW()
                AT TIME ZONE
                'Europe/Istanbul'
            )
            AT TIME ZONE
            'Europe/Istanbul'
          )

          AND created_at < (
            (
              date_trunc(
                'month',
                NOW()
                  AT TIME ZONE
                  'Europe/Istanbul'
              )
              + INTERVAL '1 month'
            )
            AT TIME ZONE
            'Europe/Istanbul'
          )
        `,
        [userId]
      );

    const monthlyCostUsd =
      Number(
        totalResult.rows?.[0]
          ?.total_cost_usd ||
        0
      );


    /*
      Yeni isteğin 0.10 USD rezervi
      güvenli sınırı aşacaksa durdur.
    */
    if (
      monthlyCostUsd +
        AI_COST_SAFETY
          .reservePerRequestUsd >
      AI_COST_SAFETY.stopAtUsd
    ) {
      await client.query(
        'ROLLBACK'
      );

      const err =
        new Error(
          'Aylık AI kullanım limitine ulaştın.'
        );

      err.status = 429;
      err.code = 'AI_COST_LIMIT';

      throw err;
    }


    /*
      Rezervasyon satırını aynı transaction
      içinde oluşturuyoruz.

      Bu satır hem günlük/aylık kota sayımında
      hem maliyet hesabında anında görünür.
    */
    const reservation =
      await client.query(
        `
        INSERT INTO yks2_ai_usage(
          user_id,
          action,
          model,
          input_tokens,
          output_tokens,
          cost_usd
        )
        VALUES(
          $1,
          $2,
          $3,
          0,
          0,
          $4
        )
        RETURNING id
        `,
        [
          userId,
          action,
          model,
          AI_COST_SAFETY
            .reservePerRequestUsd
        ]
      );

    await client.query(
      'COMMIT'
    );

    return reservation
      .rows[0]
      .id;

  } catch (err) {
    await client
      .query('ROLLBACK')
      .catch(() => {});

    throw err;

  } finally {
    client.release();
  }
}


/*
  Başarılı AI çağrısından sonra
  reservation kaydını gerçek token
  ve maliyetle güncelle.
*/
async function finalizeAiUsage({
  usageId,
  model,
  inputTokens,
  outputTokens,
  costUsd
}) {
  if (!usageId) {
    return;
  }

  try {
    await query(
      `
      UPDATE yks2_ai_usage

      SET
        model = $1,
        input_tokens = $2,
        output_tokens = $3,
        cost_usd = $4

      WHERE id = $5
      `,
      [
        model,
        inputTokens,
        outputTokens,
        costUsd,
        usageId
      ]
    );

  } catch (err) {
    console.error(
      '[AI] usage finalize failed:',
      err?.message || err
    );
  }
}


/*
  Gerçek kullanım maliyetini güncelledikten
  sonra aylık toplamı tekrar kontrol eder.

  Şu anda bu fonksiyon yeni isteği değil,
  yalnızca durumu loglar.

  Yeni istekler reserveAiCost içindeki
  stopAtUsd kontrolü tarafından durdurulur.
*/
async function checkMonthlyHardCap(
  userId
) {
  const total =
    await getMonthlyAiCostUsd(
      userId
    );

  if (
    total >=
    AI_COST_SAFETY.monthlyBudgetUsd
  ) {
    console.warn(
      `[AI] monthly hard cap reached user=${userId} total=$${total.toFixed(6)}`
    );
  }

  return total;
}


/*
  Gerçek Promise timeout.

  ÖNEMLİ:
  Promise.race alttaki HTTP isteğini kesin
  olarak iptal etmeyebilir.

  Bu nedenle timeout durumunda reservation
  kaydını silmiyoruz. API sağlayıcısı isteği
  işlemiş ve ücret yazmış olabilir.
*/
function withTimeout(
  promise,
  ms
) {
  let timer;

  const timeout =
    new Promise(
      (_, reject) => {
        timer =
          setTimeout(
            () => {
              const err =
                new Error(
                  'AI_TIMEOUT'
                );

              err.code =
                'AI_TIMEOUT';

              reject(err);
            },
            ms
          );
      }
    );

  return Promise.race([
    promise,
    timeout
  ]).finally(
    () => {
      clearTimeout(
        timer
      );
    }
  );
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
  const status =
    getStatus(err);

  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status ===
      'AI_TIMEOUT'
  );
}


/*
  Tek model çağrısı.
*/
async function generateOnce({
  ai,
  model,
  contents,
  config,
  timeoutMs
}) {
  const startedAt =
    Date.now();

  try {
    const response =
      await withTimeout(
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
      err?.message ||
      err
    );

    throw err;
  }
}


/*
  Ana Gemini çağrısı.
*/
export async function geminiText({
  userId,
  action,
  input,
  systemInstruction,
  responseSchema,
  image,
  model
}) {
  const ai =
    client();


  /*
    Handler özel model verdiyse onu kullan.

    Vermediyse:
    hızlı görev -> Flash-Lite
    diğerleri -> güçlü Flash
  */
  const fastAction =
    FAST_ACTIONS.has(
      action
    );

  const primaryModel =
    model ||
    (
      fastAction
        ? GEMINI_FAST_MODEL
        : GEMINI_MODEL
    );


  /*
    API çağrısından ÖNCE:

    - günlük kota
    - aylık kota
    - maliyet
    - eşzamanlı istek

    kontrolü ve reservation yapılır.
  */
  const usageId =
    await reserveAiCost({
      userId,
      action,
      model:
        primaryModel
    });


  const contents =
    image
      ? [
          {
            inlineData: {
              mimeType:
                image.mimeType,

              data:
                image.data
            }
          },

          {
            text:
              input
          }
        ]
      : input;


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
    Primary zaten Lite ise
    aynı modeli fallback olarak
    tekrar kullanmayacağız.
  */
  const fallbackModel =
    primaryModel ===
      GEMINI_FAST_MODEL
        ? null
        : GEMINI_FAST_MODEL;


  let response;

  let usedModel =
    primaryModel;

  let usedFallback =
    false;

  const totalStartedAt =
    Date.now();


  try {
    /*
      PRIMARY MODEL
    */
    try {
      response =
        await generateOnce({
          ai,

          model:
            primaryModel,

          contents,

          config,

          timeoutMs:
            12000
        });

    } catch (primaryError) {
      /*
        Primary başarısızsa ve hata
        retry edilebilir değilse direkt çık.
      */
      if (
        !fallbackModel ||
        !isRetryable(
          primaryError
        )
      ) {
        throw primaryError;
      }

      console.warn(
        `[AI] fallback action=${action} from=${primaryModel} to=${fallbackModel}`
      );

      usedFallback =
        true;

      usedModel =
        fallbackModel;


      /*
        FALLBACK MODEL
      */
      try {
        response =
          await generateOnce({
            ai,

            model:
              fallbackModel,

            contents,

            config: {
              ...config,

              thinkingConfig: {
                thinkingLevel:
                  'minimal'
              }
            },

            timeoutMs:
              12000
          });

      } catch (
        fallbackError
      ) {
        /*
          Fallback hatası retry edilebilir
          değilse üçüncü çağrı yapma.
        */
        if (
          !isRetryable(
            fallbackError
          )
        ) {
          throw fallbackError;
        }


        /*
          Kısa bekleme sonrası fallback'i
          bir kez daha dene.
        */
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              500
            )
        );

        response =
          await generateOnce({
            ai,

            model:
              fallbackModel,

            contents,

            config: {
              ...config,

              thinkingConfig: {
                thinkingLevel:
                  'minimal'
              }
            },

            timeoutMs:
              10000
          });
      }
    }


    /*
      Gemini usage bilgileri.
    */
    const usage =
      response?.usageMetadata ||
      {};


    const inputTokens =
      Number(
        usage.promptTokenCount ||
        0
      );


    const answerTokens =
      Number(
        usage.candidatesTokenCount ||
        0
      );


    const thinkingTokens =
      Number(
        usage.thoughtsTokenCount ||
        0
      );


    /*
      Thinking tokenları da output
      maliyet hesabına dahil.
    */
    const billableOutputTokens =
      answerTokens +
      thinkingTokens;


    /*
      Gerçek tahmini maliyet.
    */
    const costUsd =
      calculateCostUsd(
        usedModel,
        inputTokens,
        billableOutputTokens
      );


    /*
      Reservation kaydını gerçek
      kullanım değerleriyle güncelle.
    */
    await finalizeAiUsage({
      usageId,

      model:
        usedModel,

      inputTokens,

      outputTokens:
        billableOutputTokens,

      costUsd
    });


    /*
      Gerçek maliyet güncellendikten sonra
      aylık toplamı log amaçlı kontrol et.
    */
    await checkMonthlyHardCap(
      userId
    );


    const output =
      response?.text ||
      '';


    /*
      Boş yanıt dönerse kullanım yine de
      kayıtta kalır çünkü sağlayıcı çağrısı
      gerçekleşmiştir.
    */
    if (
      !output.trim()
    ) {
      const err =
        new Error(
          'Gemini boş yanıt döndürdü.'
        );

      err.status = 502;

      throw err;
    }


    const durationMs =
      Date.now() -
      totalStartedAt;


    console.log(
      `[AI] completed action=${action} model=${usedModel} fallback=${usedFallback} total=${durationMs}ms cost=$${costUsd.toFixed(6)}`
    );


    return output;

  } catch (err) {
    /*
      Reservation özellikle silinmiyor.

      Timeout / sağlayıcı hatası durumunda
      gerçek sağlayıcı maliyetini kesin
      bilemeyebiliriz.

      Böylece başarısız çağrılar maliyet
      limitini tamamen bypass edemez.
    */
    console.error(
      `[AI] request failed action=${action} reservation=${usageId}`,
      err?.message ||
      err
    );

    throw err;
  }
}
