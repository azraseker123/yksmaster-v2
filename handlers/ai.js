import { requireUser } from '../lib/auth.js';
import { onlyMethods, text, int } from '../lib/http.js';
import { query } from '../lib/db.js';

import {
  geminiText,
  GEMINI_MODEL,
  GEMINI_FAST_MODEL
} from '../lib/gemini.js';

import {
  getSubjectPerformance,
  getQuestionTotals,
  getStudySummary
} from '../lib/stats.js';

import { getStreak } from '../lib/activity.js';
import { getCurriculumForField } from '../data/curriculum.js';
import { turkeyDate, addDays } from '../lib/dates.js';


const DAILY_LIMITS = {
  coach: 50,
  flashcards: 15,
  test: 15,
  program: 3,
  wrong_analysis: 5,
  solve_image: 15
};


async function enforceDailyLimit(user, action) {
  if (user.role === 'admin') return;

  const limit = DAILY_LIMITS[action];

  if (!limit) return;

  const r = await query(
    `
      SELECT COUNT(*)::int AS c
      FROM yks2_ai_usage
      WHERE user_id = $1
        AND action = $2
        AND created_at >= (
          date_trunc(
            'day',
            NOW() AT TIME ZONE 'Europe/Istanbul'
          ) AT TIME ZONE 'Europe/Istanbul'
        )
    `,
    [user.id, action]
  );

  if (r.rows[0].c >= limit) {
    const err = new Error(
      'Günlük AI kullanım sınırına ulaştın. Yarın yeniden kullanabilirsin.'
    );

    err.status = 429;
    throw err;
  }
}


/*
  Bütün metin üreten AI özellikleri için ortak kurallar.
*/
const OUTPUT_RULES = `
YANIT BİÇİMİ:
- Türkçe yaz.
- Doğrudan kullanıcının sorusuna cevap ver.
- Gereksiz selamlama, övgü ve giriş cümleleri kullanma.
- "Harika soru", "mükemmel", "çok güzel düşünmüşsün" gibi dolgu cümleleri kullanma.
- Markdown biçimlendirme karakterleri kullanma.
- Çift yıldız, tek yıldız, hashtag, ters tik kullanma.
- LaTeX kullanma.
- $ veya $$ matematik ayraçları kullanma.
- \\frac, \\div, \\times, \\boxed gibi LaTeX komutları kullanma.
- Matematik işlemlerini normal okunabilir Unicode/metin biçiminde yaz.
- Örnek: "40 ÷ 5 = 8", "2 × 3 = 6", "x²", "√16 = 4".
- Başlık gerekiyorsa sade metin başlığı kullan.
- Cevabı gereksiz yere uzatma.
- Bilmediğin veya veriden çıkarılamayan şeyi uydurma.
`;


const SYSTEM = `
Sen YKS Master 360 uygulamasındaki kişisel YKS eğitim koçusun.

Yalnızca Türkiye'deki YKS hazırlığı bağlamında yardımcı ol.

Kullanıcının kayıtlı alanı:
- Sayısal
- Eşit Ağırlık
- Sözel

Dil öğrencileri desteklenmiyor.

Öğrenciyi suçlama.
Kesin başarı veya sıralama garantisi verme.
Uydurma sınav sonucu üretme.
Uydurma öğrenci verisi üretme.
Uydurma müfredat bilgisi üretme.

Müfredatla ilgili işlemlerde sana verilen takip müfredatının dışına çıkma.

Yanıtların:
- anlaşılır,
- uygulanabilir,
- öğrenci seviyesine uygun,
- mümkün olduğunca net
olsun.

${OUTPUT_RULES}
`;


async function context(user) {
  const [
    performance,
    questions,
    study,
    streak,
    exams,
    review
  ] = await Promise.all([
    getSubjectPerformance(user.id),
    getQuestionTotals(user.id),
    getStudySummary(user.id),
    getStreak(user.id),

    query(
      `
        SELECT
          exam_type,
          exam_name,
          exam_date::text,
          total_net,
          details
        FROM yks2_exam_results
        WHERE user_id = $1
        ORDER BY exam_date DESC, id DESC
        LIMIT 6
      `,
      [user.id]
    ),

    query(
      `
        SELECT
          exam,
          subject,
          topic_id
        FROM yks2_curriculum_progress
        WHERE user_id = $1
          AND review_needed = true
        ORDER BY updated_at DESC
        LIMIT 30
      `,
      [user.id]
    )
  ]);

  return {
    profile: {
      track: user.track,
      targetCity: user.target_city,
      targetUniversity: user.target_university,
      targetDepartment: user.target_department,
      targetRank: user.target_rank
    },

    performance,
    questions,
    study,
    streak,

    recentExams: exams.rows,
    reviewList: review.rows
  };
}


function getTopic(
  curriculum,
  exam,
  subject,
  topicId
) {
  return (
    curriculum[exam]?.[subject]?.find(
      t => t.id === topicId
    ) || null
  );
}


function parseStructured(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error(
      'AI çıktısı düzgün oluşturulamadı. Lütfen yeniden dene.'
    );

    err.status = 502;
    throw err;
  }
}


function validateFlashcards(data, count) {
  if (
    !Array.isArray(data?.cards) ||
    data.cards.length !== count
  ) {
    throw Object.assign(
      new Error(
        'Flashcard çıktısı doğrulanamadı. Lütfen yeniden dene.'
      ),
      { status: 502 }
    );
  }

  data.cards = data.cards
    .map(x => ({
      front: text(x?.front, 800),
      back: text(x?.back, 1600)
    }))
    .filter(
      x => x.front && x.back
    );

  if (data.cards.length !== count) {
    throw Object.assign(
      new Error(
        'Flashcard çıktısı eksik geldi. Lütfen yeniden dene.'
      ),
      { status: 502 }
    );
  }

  return data;
}


function validateTest(data, count) {
  if (
    !Array.isArray(data?.questions) ||
    data.questions.length !== count
  ) {
    throw Object.assign(
      new Error(
        'Test çıktısı doğrulanamadı. Lütfen yeniden dene.'
      ),
      { status: 502 }
    );
  }

  data.questions = data.questions.map(q => ({
    question: text(
      q?.question,
      2200
    ),

    options:
      Array.isArray(q?.options)
        ? q.options
            .slice(0, 5)
            .map(o => text(o, 1000))
        : [],

    correctIndex:
      Number(q?.correctIndex),

    explanation:
      text(
        q?.explanation,
        2400
      )
  }));


  if (
    data.questions.some(
      q =>
        !q.question ||
        q.options.length < 4 ||
        !Number.isInteger(q.correctIndex) ||
        q.correctIndex < 0 ||
        q.correctIndex >= q.options.length ||
        !q.explanation
    )
  ) {
    throw Object.assign(
      new Error(
        'Test seçenekleri doğrulanamadı. Lütfen yeniden dene.'
      ),
      { status: 502 }
    );
  }

  return data;
}


function validateProgram(
  data,
  curriculum,
  dates
) {
  if (
    !data ||
    !Array.isArray(data.days) ||
    data.days.length !== 7
  ) {
    throw Object.assign(
      new Error(
        'AI programı 7 günlük yapıda gelmedi. Lütfen yeniden oluştur.'
      ),
      { status: 502 }
    );
  }


  const dateSet =
    new Set(dates);

  const seen =
    new Set();


  for (const day of data.days) {
    if (
      !dateSet.has(day?.date) ||
      seen.has(day.date) ||
      !Array.isArray(day?.tasks)
    ) {
      throw Object.assign(
        new Error(
          'AI programının tarihleri doğrulanamadı. Lütfen yeniden oluştur.'
        ),
        { status: 502 }
      );
    }


    seen.add(day.date);


    if (day.tasks.length > 12) {
      throw Object.assign(
        new Error(
          'AI programında bir güne çok fazla görev üretildi.'
        ),
        { status: 502 }
      );
    }


    day.tasks =
      day.tasks.map(task => ({
        exam:
          text(
            task?.exam,
            3
          ).toUpperCase(),

        subject:
          text(
            task?.subject,
            100
          ),

        topic:
          text(
            task?.topic,
            180
          ),

        minutes:
          int(
            task?.minutes,
            1,
            720
          ) || 30,

        reason:
          text(
            task?.reason,
            500
          )
      }));


    for (const task of day.tasks) {
      if (
        !['TYT', 'AYT'].includes(
          task.exam
        )
      ) {
        throw Object.assign(
          new Error(
            'AI programındaki sınav türü doğrulanamadı.'
          ),
          { status: 502 }
        );
      }


      const allowedTopics =
        curriculum[task.exam]?.[
          task.subject
        ] || [];


      if (
        !allowedTopics.length ||
        !task.topic ||
        !allowedTopics.some(
          t => t.name === task.topic
        )
      ) {
        throw Object.assign(
          new Error(
            'AI programındaki bir ders veya konu takip müfredatıyla eşleşmedi. Yeniden oluşturmayı dene.'
          ),
          { status: 502 }
        );
      }
    }
  }


  data.summary =
    text(
      data.summary,
      3000
    );

  return data;
}


/*
  Gemini'den gelen teknik hatayı
  kullanıcıya uygun HTTP hatasına çevirir.
*/
function aiErrorResponse(err, res) {
  console.error(
    'AI error:',
    err
  );


  const status =
    err?.status ||
    err?.code ||
    err?.response?.status;


  if (
    status === 429
  ) {
    return res.status(429).json({
      error:
        err?.message?.includes(
          'Günlük AI kullanım'
        )
          ? err.message
          : 'AI şu anda yoğun. Birkaç saniye sonra yeniden dene.'
    });
  }


  if (
    status === 502
  ) {
    return res.status(502).json({
      error:
        err.message ||
        'AI yanıtı düzgün oluşturulamadı. Yeniden dene.'
    });
  }


  if (
    status === 503 ||
    status === 504 ||
    status === 408 ||
    status === 'AI_TIMEOUT' ||
    String(err?.message || '')
      .includes('AI_TIMEOUT')
  ) {
    return res.status(503).json({
      error:
        'AI servisi şu anda yoğun. Lütfen birkaç saniye sonra yeniden dene.'
    });
  }


  if (
    String(err?.message || '')
      .includes('GEMINI_API_KEY')
  ) {
    return res.status(500).json({
      error:
        'Gemini API anahtarı yapılandırılmamış.'
    });
  }


  return res.status(500).json({
    error:
      'AI isteği tamamlanamadı. Lütfen yeniden dene.'
  });
}


export default async function handler(
  req,
  res
) {
  if (
    !onlyMethods(
      req,
      res,
      ['POST']
    )
  ) {
    return;
  }


  const user =
    await requireUser(
      req,
      res,
      { pro: true }
    );


  if (!user) return;


  const action =
    text(
      req.body?.action,
      40
    );


  try {
    if (
      !Object.hasOwn(
        DAILY_LIMITS,
        action
      )
    ) {
      return res.status(400).json({
        error:
          'Geçersiz AI işlemi.'
      });
    }


    await enforceDailyLimit(
      user,
      action
    );


    const ctx =
      await context(user);


    const curriculum =
      getCurriculumForField(
        user.track
      );


    const curriculumLabels = {
      TYT:
        Object.fromEntries(
          Object.entries(
            curriculum.TYT
          ).map(
            ([subject, topics]) => [
              subject,
              topics.map(
                x => x.name
              )
            ]
          )
        ),

      AYT:
        Object.fromEntries(
          Object.entries(
            curriculum.AYT
          ).map(
            ([subject, topics]) => [
              subject,
              topics.map(
                x => x.name
              )
            ]
          )
        )
    };


    /*
      AI KOÇ
    */
    if (action === 'coach') {
      const message =
        text(
          req.body?.message,
          5000
        );


      if (!message) {
        return res.status(400).json({
          error:
            'Mesaj gerekli.'
        });
      }


      const answer =
        await geminiText({
          userId:
            user.id,

          action,

          model:
            GEMINI_MODEL,

          systemInstruction:
            `${SYSTEM}

ÖĞRENCİ VERİLERİ:
${JSON.stringify(ctx)}

TAKİP MÜFREDATI:
${JSON.stringify(curriculumLabels)}

AI KOÇ KURALLARI:
- Öğrencinin sorusu genel bir bilgi sorusuysa gereksiz yere tüm öğrenci verilerini anlatma.
- Kişisel çalışma önerisi istiyorsa öğrenci verilerini kullan.
- Öğrencinin verilerinde olmayan bir sonucu varmış gibi söyleme.
- Önce soruyu cevapla, gerekiyorsa ardından kısa öneri ver.
- Mümkün olduğunda kısa paragraflar kullan.
`,

          input:
            message
        });


      return res
        .status(200)
        .json({
          answer,
          model:
            GEMINI_MODEL
        });
    }


    /*
      FLASHCARD + TEST LAB
    */
    if (
      action === 'flashcards' ||
      action === 'test'
    ) {
      const exam =
        text(
          req.body?.exam,
          3
        ).toUpperCase();


      const subject =
        text(
          req.body?.subject,
          100
        );


      const topicId =
        text(
          req.body?.topicId,
          120
        );


      const topic =
        getTopic(
          curriculum,
          exam,
          subject,
          topicId
        );


      const count =
        int(
          req.body?.count,
          5,
          20
        ) || 10;


      if (!topic) {
        return res.status(400).json({
          error:
            'Geçerli ders ve konu seç.'
        });
      }


      if (
        action === 'flashcards'
      ) {
        const schema = {
          type: 'object',

          properties: {
            cards: {
              type: 'array',
              minItems: count,
              maxItems: count,

              items: {
                type: 'object',

                properties: {
                  front: {
                    type: 'string'
                  },

                  back: {
                    type: 'string'
                  }
                },

                required: [
                  'front',
                  'back'
                ]
              }
            }
          },

          required: [
            'cards'
          ]
        };


        const raw =
          await geminiText({
            userId:
              user.id,

            action,

            model:
              GEMINI_FAST_MODEL,

            systemInstruction:
              `${SYSTEM}

Yalnızca:
${exam} ${subject} - ${topic.name}

konusuyla ilgili flashcard üret.

Kurallar:
- Kısa ve öğretici olsun.
- Ezberden çok anlamayı desteklesin.
- Kapsam dışına çıkma.
- Kartların cevapları gereksiz uzun olmasın.
`,

            input:
              `${count} adet flashcard üret.`,

            responseSchema:
              schema
          });


        return res
          .status(200)
          .json({
            ...validateFlashcards(
              parseStructured(raw),
              count
            ),

            model:
              GEMINI_FAST_MODEL
          });
      }


      const schema = {
        type: 'object',

        properties: {
          questions: {
            type: 'array',
            minItems: count,
            maxItems: count,

            items: {
              type: 'object',

              properties: {
                question: {
                  type: 'string'
                },

                options: {
                  type: 'array',
                  minItems: 4,
                  maxItems: 5,

                  items: {
                    type: 'string'
                  }
                },

                correctIndex: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 4
                },

                explanation: {
                  type: 'string'
                }
              },

              required: [
                'question',
                'options',
                'correctIndex',
                'explanation'
              ]
            }
          }
        },

        required: [
          'questions'
        ]
      };


      const raw =
        await geminiText({
          userId:
            user.id,

          action,

          model:
            GEMINI_FAST_MODEL,

          systemInstruction:
            `${SYSTEM}

${exam} ${subject} - ${topic.name}
konusunda özgün mini test oluştur.

Kurallar:
- YKS seviyesinde olsun.
- Her sorunun tek doğru cevabı olsun.
- correctIndex 0 tabanlı olsun.
- Kapsam dışı bilgi sorma.
- Açıklama doğru cevabın neden doğru olduğunu kısa ve öğretici biçimde anlatsın.
`,

          input:
            `${count} soruluk test üret.`,

          responseSchema:
            schema
        });


      return res
        .status(200)
        .json({
          ...validateTest(
            parseStructured(raw),
            count
          ),

          model:
            GEMINI_FAST_MODEL
        });
    }


    /*
      AI PROGRAM
    */
    if (
      action === 'program'
    ) {
      const hours =
        int(
          req.body?.hoursPerDay,
          1,
          12
        ) || 4;


      const note =
        text(
          req.body?.note,
          1600
        );


      const start =
        turkeyDate();


      const dates =
        Array.from(
          { length: 7 },
          (_, i) =>
            addDays(start, i)
        );


      const schema = {
        type: 'object',

        properties: {
          summary: {
            type: 'string'
          },

          days: {
            type: 'array',
            minItems: 7,
            maxItems: 7,

            items: {
              type: 'object',

              properties: {
                date: {
                  type: 'string',
                  format: 'date'
                },

                tasks: {
                  type: 'array',

                  items: {
                    type: 'object',

                    properties: {
                      exam: {
                        type: 'string',
                        enum: [
                          'TYT',
                          'AYT'
                        ]
                      },

                      subject: {
                        type: 'string'
                      },

                      topic: {
                        type: 'string'
                      },

                      minutes: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 720
                      },

                      reason: {
                        type: 'string'
                      }
                    },

                    required: [
                      'exam',
                      'subject',
                      'topic',
                      'minutes',
                      'reason'
                    ]
                  }
                }
              },

              required: [
                'date',
                'tasks'
              ]
            }
          }
        },

        required: [
          'summary',
          'days'
        ]
      };


      const raw =
        await geminiText({
          userId:
            user.id,

          action,

          model:
            GEMINI_FAST_MODEL,

          systemInstruction:
            `${SYSTEM}

7 günlük gerçekçi çalışma programı oluştur.

Öğrencinin:
- hedefini,
- performansını,
- son denemelerini,
- tekrar listesini
dikkate al.

Günlük yaklaşık ${hours} saat çalışma planla.

Kullanılabilecek tarihler SADECE:
${dates.join(', ')}

ÖĞRENCİ VERİLERİ:
${JSON.stringify(ctx)}

DERS VE KONU LİSTESİ:
${JSON.stringify(curriculumLabels)}

ÇOK ÖNEMLİ:
- Sadece öğrencinin alanına uygun TYT ve AYT derslerini kullan.
- exam alanı sadece TYT veya AYT olabilir.
- Ders ve konu adlarını verilen listeden BİREBİR kullan.
- Liste dışında konu adı üretme.
- Bir günü gereksiz sayıda küçük göreve bölme.
- Günlük süreyi mümkün olduğunca ${hours} saate yakın tut.
`,

          input:
            `Program oluştur.

Kullanıcı notu:
${note || 'Yok'}`,

          responseSchema:
            schema
        });


      return res
        .status(200)
        .json({
          ...validateProgram(
            parseStructured(raw),
            curriculum,
            dates
          ),

          model:
            GEMINI_FAST_MODEL
        });
    }


    /*
      YANLIŞ ANALİZİ
    */
    if (
      action === 'wrong_analysis'
    ) {
      const [
        logs,
        mistakes
      ] = await Promise.all([
        query(
          `
            SELECT
              exam,
              subject,
              topic,
              SUM(correct_count)::int AS correct,
              SUM(wrong_count)::int AS wrong,
              SUM(blank_count)::int AS blank
            FROM yks2_question_logs
            WHERE user_id = $1
            GROUP BY exam, subject, topic
            ORDER BY SUM(wrong_count) DESC
            LIMIT 80
          `,
          [user.id]
        ),

        query(
          `
            SELECT
              exam,
              subject,
              topic,
              source_name,
              note,
              resolved,
              created_at
            FROM yks2_mistake_archive
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 80
          `,
          [user.id]
        )
      ]);


      const answer =
        await geminiText({
          userId:
            user.id,

          action,

          model:
            GEMINI_MODEL,

          systemInstruction:
            `${SYSTEM}

Bu özellik öğrencinin yanlışlarını analiz eder.

Kurallar:
- Veri azsa bunu açıkça söyle.
- Yanlış yoğunluğunu ders ve konu bazında değerlendir.
- Öğrencinin neden yanlış yaptığını kesinmiş gibi uydurma.
- Yalnızca verilerden çıkan işaretleri ve öğrencinin kendi notlarını kullan.
- En önemli 3 önceliği belirle.
- Her öncelik için uygulanabilir düzeltme önerisi ver.
- Genel motivasyon konuşması yapma.
`,

          input:
            `SORU KAYITLARI:
${JSON.stringify(logs.rows)}

YANLIŞ ARŞİVİ:
${JSON.stringify(mistakes.rows)}

ÖĞRENCİ PROFİLİ:
${JSON.stringify(ctx)}`
        });


      return res
        .status(200)
        .json({
          answer,
          model:
            GEMINI_MODEL
        });
    }


    /*
      FOTOĞRAFTAN SORU ÇÖZME
    */
    if (
      action === 'solve_image'
    ) {
      const imageData =
        String(
          req.body?.imageData ||
          ''
        );


      const prompt =
        text(
          req.body?.prompt,
          1200
        ) ||
        `Bu YKS sorusunu çöz.

Öğrencinin anlamadığı noktayı öğretir gibi açıkla.
Final cevabı en sonda belirt.`;


      const m =
        imageData.match(
          /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/
        );


      if (!m) {
        return res.status(400).json({
          error:
            'Geçerli JPEG, PNG veya WEBP soru fotoğrafı gerekli.'
        });
      }


      if (
        m[2].length >
        12_000_000
      ) {
        return res.status(413).json({
          error:
            'Görsel çok büyük.'
        });
      }


      const answer =
        await geminiText({
          userId:
            user.id,

          action,

          model:
            GEMINI_MODEL,

          systemInstruction:
            `${SYSTEM}

SENİN GÖREVİN:
Fotoğraftaki YKS sorusunu öğrencinin gerçekten anlayacağı biçimde açıklamak.

KURALLAR:
- Önce görseldeki soruyu doğru anladığından emin ol.
- Görsel yeterince okunmuyorsa ASLA tahmin etme; daha net fotoğraf iste.
- Soruyu baştan sona gereksiz yere tekrar yazma.
- Öğrencinin özellikle sorduğu noktaya öncelik ver.
- Çözümü mantıksal adımlara ayır.
- Formül kullanıyorsan formülün neden kullanıldığını açıkla.
- Matematik ifadelerini sade metin ve Unicode karakterlerle yaz.
- LaTeX KULLANMA.
- $ ve $$ KULLANMA.
- \\frac, \\div, \\times, \\boxed gibi komutlar KULLANMA.
- **kalın** gibi Markdown işaretleri KULLANMA.
- Gereksiz övgü veya giriş yapma.
- Final cevabı en sonda "Cevap: ..." biçiminde belirt.
`,

          input:
            prompt,

          image: {
            data:
              m[2],

            mimeType:
              m[1]
          }
        });


      return res
        .status(200)
        .json({
          answer,
          model:
            GEMINI_MODEL
        });
    }


    return res
      .status(400)
      .json({
        error:
          'Geçersiz AI işlemi.'
      });

  } catch (err) {
    return aiErrorResponse(
      err,
      res
    );
  }
}
