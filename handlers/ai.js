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
  solve_image: 15,
  recovery: 3,
  exam_analysis: 5
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


function normalizeProgramLabel(value = '') {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/[’'"]/g, '')
    .replace(/[(){}\[\].,:;!?/\\|_-]/g, ' ')
    .replace(/\bkonusu\b/g, '')
    .replace(/\bkonu\b/g, '')
    .replace(/\bdersi\b/g, '')
    .replace(/\bders\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


function findCanonicalSubject(curriculum, exam, subject) {
  const subjects =
    Object.keys(curriculum[exam] || {});

  const wanted =
    normalizeProgramLabel(subject);

  return subjects.find(
    s =>
      normalizeProgramLabel(s) === wanted
  ) || null;
}


function findCanonicalTopic(topics, topic) {
  const wanted =
    normalizeProgramLabel(topic);

  if (!wanted) return null;

  // Önce tamamen aynı olanı bul.
  const exact =
    topics.find(
      t =>
        normalizeProgramLabel(t.name) === wanted
    );

  if (exact) return exact;


  /*
    AI bazen resmi konu adına küçük bir ekleme
    yapabiliyor.

    Örneğin:
    "Fonksiyonlar konusu"
    "Paragrafta Anlam"
    gibi.

    Yalnızca tek bir açık eşleşme varsa kabul et.
  */
  const possible =
    topics.filter(t => {
      const official =
        normalizeProgramLabel(t.name);

      if (
        official.length < 5 ||
        wanted.length < 5
      ) {
        return false;
      }

      return (
        official.includes(wanted) ||
        wanted.includes(official)
      );
    });


  return possible.length === 1
    ? possible[0]
    : null;
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


      /*
        AI'ın ders adını resmi müfredattaki
        ders adına dönüştür.
      */
      const canonicalSubject =
        findCanonicalSubject(
          curriculum,
          task.exam,
          task.subject
        );


      if (!canonicalSubject) {
        console.warn(
          '[AI PROGRAM] Subject mismatch:',
          {
            exam: task.exam,
            received: task.subject
          }
        );

        throw Object.assign(
          new Error(
            `AI programındaki "${task.subject}" dersi takip müfredatıyla eşleşmedi. Yeniden oluşturmayı dene.`
          ),
          { status: 502 }
        );
      }


      const allowedTopics =
        curriculum[task.exam]?.[
          canonicalSubject
        ] || [];


      /*
        AI'ın konu adını resmi konu adına
        dönüştür.
      */
      const canonicalTopic =
        findCanonicalTopic(
          allowedTopics,
          task.topic
        );


      if (!canonicalTopic) {
        console.warn(
          '[AI PROGRAM] Topic mismatch:',
          {
            exam: task.exam,
            subject: canonicalSubject,
            received: task.topic
          }
        );

        throw Object.assign(
          new Error(
            `AI programındaki "${task.topic}" konusu takip müfredatıyla eşleşmedi. Yeniden oluşturmayı dene.`
          ),
          { status: 502 }
        );
      }


      /*
        Kullanıcıya AI'ın yaklaşık yazdığı isim
        yerine her zaman resmi adı göster.
      */
      task.subject =
        canonicalSubject;

      task.topic =
        canonicalTopic.name;
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

  const targetMinutes =
    hours * 60;

  /*
    Günlük görev sayısını çalışma süresine göre
    belirliyoruz.
  */
  const minTasks =
    hours <= 4
      ? 4
      : hours <= 7
        ? 5
        : 6;

  const maxTasks =
    hours <= 4
      ? 5
      : hours <= 7
        ? 6
        : 8;


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
              minItems: minTasks,
              maxItems: maxTasks,

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

                  priority: {
                    type: 'string',
                    enum: [
                      'high',
                      'medium',
                      'low'
                    ]
                  },

                  reason: {
                    type: 'string'
                  }
                },

                required: [
                  'exam',
                  'subject',
                  'topic',
                  'priority',
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

Sen yalnızca görev SEÇECEKSİN.
Görev sürelerini SEN belirleme.
Dakikaları uygulamanın backend'i hesaplayacak.

7 günlük gerçekten kişiselleştirilmiş YKS çalışma programı oluştur.

ÖNCELİK SIRASI:
1. Kullanıcının yazdığı özel not
2. Son denemelerdeki zayıflıklar
3. Soru performansı
4. Tekrar listesi
5. Hedef bölüm ve sıralama
6. Müfredat dengesi

Öğrenci günlük yaklaşık ${hours} saat çalışacak.

Her gün:
- En az ${minTasks}, en fazla ${maxTasks} görev seç.
- Aynı günü tek bir derse yığma.
- Ancak kullanıcı özellikle bir dersi "ağırlıklı" istediyse o derse daha fazla görev ver.
- Kullanıcı özel notunda belirli dersleri açıkça isimlendirmişse, programı öncelikle ve mümkün olduğunca SADECE bu derslerden oluştur.
- Kullanıcı "X ağırlıklı, Y ve Z yan ders" diyorsa X ana ağırlık olmalı; Y ve Z destek dersleri olmalı.
- Kullanıcının açıkça istemediği başka bir dersi yalnızca öğrenci verilerinde acil bir tekrar ihtiyacı varsa ekle; böyle bir durumda reason alanında neden eklendiğini açıkça belirt.
- Kullanıcının özel notuna mümkün olduğunca sadık kal.

PARAGRAF KURALI:
- Paragraf tek başına günün ana çalışması olamaz.
- Genellikle günde en fazla 1 paragraf görevi seç.
- Kullanıcı özellikle istemediyse her gün aynı paragraf konusunu tekrar etme.

TEKRAR KURALI:
- Aynı konuyu 7 gün boyunca sürekli verme.
- Aynı konu gerçekten zayıf veya tekrar listesinde değilse haftada en fazla 2-3 kez kullan.
- Konuları haftaya yay.

KİŞİSELLEŞTİRME:
- Öğrencinin verilerinde zayıflık varsa high priority ver.
- Kullanıcının özellikle ağırlık istediği derse high priority ver.
- Koruma/yan çalışma olan derslere medium veya low priority ver.
- reason alanı genel cümle olmasın.
- Mümkünse öğrencinin kendi verisine veya isteğine dayanarak neden seçildiğini yaz.

Kullanılabilecek tarihler SADECE:
${dates.join(', ')}

ÖĞRENCİ VERİLERİ:
${JSON.stringify(ctx)}

DERS VE KONU LİSTESİ:
${JSON.stringify(curriculumLabels)}

ÇOK ÖNEMLİ:
- Sadece öğrencinin alanına uygun TYT ve AYT derslerini kullan.
- exam sadece TYT veya AYT olabilir.
- Ders ve konu adlarını verilen listeden kullan.
- Liste dışında konu üretme.
- minutes alanı üretme.
`,

      input:
        `7 günlük program görevlerini oluştur.

Kullanıcının özel isteği:
${note || 'Özel isteği yok.'}`,

      responseSchema:
        schema
    });


  const plan =
    parseStructured(raw);


  /*
    AI sadece öncelik belirledi.
    Dakikaları burada biz dağıtıyoruz.
  */
  for (const day of plan.days || []) {

    const tasks =
      Array.isArray(day.tasks)
        ? day.tasks
        : [];


    const priorityWeight = {
      high: 1.45,
      medium: 1,
      low: 0.72
    };


    const getTaskRules = task => {
      const label =
        normalizeProgramLabel(
          `${task.subject} ${task.topic}`
        );


      /*
        Paragraf kısa ve düzenli çalışma olmalı.
      */
      if (
        label.includes('paragraf')
      ) {
        return {
          min: 25,
          max: 40
        };
      }


      /*
        Matematik daha uzun odak bloklarına
        izin verebilir ama 2-2.5 saatlik tek
        görev yok.
      */
      if (
        label.includes('matematik')
      ) {
        return {
          min: 45,
          max: 90
        };
      }


      if (
        label.includes('geometri') ||
        label.includes('ucgen')
      ) {
        return {
          min: 40,
          max: 75
        };
      }


      /*
        Fen ve diğer normal konu blokları.
      */
      return {
        min: 30,
        max: 70
      };
    };


    const weighted =
      tasks.map(task => {
        const rules =
          getTaskRules(task);

        return {
          task,
          weight:
            priorityWeight[
              task.priority
            ] || 1,

          min:
            rules.min,

          max:
            rules.max
        };
      });


    const totalWeight =
      weighted.reduce(
        (sum, x) =>
          sum + x.weight,
        0
      ) || 1;


    /*
      İlk süre dağılımı.
    */
    weighted.forEach(x => {
      let minutes =
        Math.round(
          (
            targetMinutes *
            x.weight /
            totalWeight
          ) / 5
        ) * 5;


      minutes =
        Math.max(
          x.min,
          Math.min(
            x.max,
            minutes
          )
        );


      x.minutes =
        minutes;
    });


    /*
      Hedef süreye yaklaşmak için kalan dakikaları
      5'er dakika dağıt.
    */
    let currentTotal =
      weighted.reduce(
        (sum, x) =>
          sum + x.minutes,
        0
      );


    let safety = 0;


    while (
      currentTotal <
        targetMinutes - 5 &&
      safety < 500
    ) {
      safety++;


      const candidates =
        weighted
          .filter(
            x =>
              x.minutes + 5 <= x.max
          )
          .sort(
            (a, b) =>
              (
                b.weight *
                (b.max - b.minutes)
              ) -
              (
                a.weight *
                (a.max - a.minutes)
              )
          );


      if (!candidates.length) {
        break;
      }


      candidates[0].minutes += 5;
      currentTotal += 5;
    }


    safety = 0;


    while (
      currentTotal >
        targetMinutes + 5 &&
      safety < 500
    ) {
      safety++;


      const candidates =
        weighted
          .filter(
            x =>
              x.minutes - 5 >= x.min
          )
          .sort(
            (a, b) =>
              a.weight - b.weight
          );


      if (!candidates.length) {
        break;
      }


      candidates[0].minutes -= 5;
      currentTotal -= 5;
    }


    day.tasks =
      weighted.map(x => ({
        exam:
          x.task.exam,

        subject:
          x.task.subject,

        topic:
          x.task.topic,

        minutes:
          x.minutes,

        reason:
          x.task.reason
      }));
  }


  const validated =
    validateProgram(
      plan,
      curriculum,
      dates
    );


  return res
    .status(200)
    .json({
      ...validated,

      model:
        GEMINI_FAST_MODEL
    });
}
/*
  BENİ TOPARLA
*/
if (action === 'recovery') {
  const hours =
    int(
      req.body?.hoursAvailable,
      1,
      12
    ) || 4;

  const message =
    text(
      req.body?.message,
      1800
    );

  if (!message) {
    return res.status(400).json({
      error:
        'Durumunu kısaca anlatman gerekiyor.'
    });
  }

  /*
    Beni Toparla'nın amacı normal bir haftalık
    program üretmek değil.

    Öğrencinin bugün yeniden düzene girmesi için
    uygulanabilir bir kurtarma planı üretmek.
  */
  const targetMinutes = hours * 60;

  const minTasks =
    hours <= 3
      ? 3
      : hours <= 6
        ? 4
        : 5;

  const maxTasks =
    hours <= 3
      ? 4
      : hours <= 6
        ? 6
        : 8;


  const schema = {
    type: 'object',

    properties: {
      title: {
        type: 'string'
      },

      summary: {
        type: 'string'
      },

      tasks: {
        type: 'array',
        minItems: minTasks,
        maxItems: maxTasks,

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

            priority: {
              type: 'string',
              enum: [
                'high',
                'medium',
                'low'
              ]
            },

            reason: {
              type: 'string'
            }
          },

          required: [
            'exam',
            'subject',
            'topic',
            'priority',
            'reason'
          ]
        }
      },

      tomorrowNote: {
        type: 'string'
      }
    },

    required: [
      'title',
      'summary',
      'tasks',
      'tomorrowNote'
    ]
  };


  const raw =
    await geminiText({
      userId:
        user.id,

      action,

      /*
        Bu özellik program mantığına benzediği
        için önce hızlı/ucuz modeli kullanıyoruz.
      */
      model:
        GEMINI_FAST_MODEL,

      systemInstruction:
        `${SYSTEM}

Sen "Beni Toparla" modusun.

AMAÇ:
Düzeni bozulmuş, birkaç gün çalışamamış,
programından geri kalmış veya bugün ne
yapacağını bilemeyen bir YKS öğrencisini
gerçekçi biçimde yeniden düzene sok.

Bu normal bir çalışma programı değildir.
Bu bir KURTARMA PLANI'dır.

Öğrencinin bugün yaklaşık ${hours} saat zamanı var.

ÇOK ÖNEMLİ KURALLAR:
- Öğrencinin kaçırdığı bütün çalışmaları tek güne sıkıştırma.
- "Kaybettiğin zamanı telafi et" mantığıyla aşırı görev verme.
- Öğrenciyi cezalandıran veya suçlayan bir dil kullanma.
- Önce en kritik açıkları seç.
- Bugün tamamlanabilecek gerçekçi görevler üret.
- Öğrencinin kendi mesajını en yüksek öncelikli veri kabul et.
- Ardından tekrar listesi, son denemeler, soru performansı ve çalışma verilerini kullan.
- Kullanıcının özellikle söylediği dersleri önceliklendir.
- Kullanıcı belirli bir dersin aksadığını söylüyorsa bu dersi plana yansıt.
- Verilerde olmayan bir eksikliği varmış gibi uydurma.
- Ders ve konu isimlerini yalnızca verilen takip müfredatından seç.
- Her görev için neden seçildiğini reason alanında açıkla.
- Dakika üretme. Dakikaları backend hesaplayacak.
- Aynı konuyu gereksiz yere birden fazla göreve bölme.
- Plan mümkün olduğunca çeşitli fakat dağınık olmayan bir yapıda olsun.
- summary kısa biçimde bugünün stratejisini anlatsın.
- tomorrowNote öğrencinin yarın ne yapması gerektiğini 1-3 cümlede söylesin.

ÖNCELİK SIRASI:
1. Öğrencinin bu mesajda anlattığı problem
2. Tekrar gereken konular
3. Son denemelerdeki zayıflıklar
4. Soru performansı
5. Son çalışma düzeni
6. Hedefleri

ÖĞRENCİ VERİLERİ:
${JSON.stringify(ctx)}

TAKİP MÜFREDATI:
${JSON.stringify(curriculumLabels)}
`,

      input:
        `Öğrencinin durumu:
${message}

Bugün ayırabileceği süre:
${hours} saat

Bugün öğrenciyi yeniden düzene sokacak
kurtarma görevlerini oluştur.`,

      responseSchema:
        schema
    });


  const recovery =
    parseStructured(raw);


  /*
    Görevleri resmi müfredat adlarıyla
    doğrula ve canonical hale getir.
  */
  const cleanedTasks = [];

  for (
    const rawTask of
    Array.isArray(recovery.tasks)
      ? recovery.tasks
      : []
  ) {
    const exam =
      text(
        rawTask?.exam,
        3
      ).toUpperCase();

    const subject =
      text(
        rawTask?.subject,
        100
      );

    const topic =
      text(
        rawTask?.topic,
        180
      );

    if (
      !['TYT', 'AYT'].includes(exam)
    ) {
      throw Object.assign(
        new Error(
          'Beni Toparla planındaki sınav türü doğrulanamadı.'
        ),
        { status: 502 }
      );
    }


    const canonicalSubject =
      findCanonicalSubject(
        curriculum,
        exam,
        subject
      );


    if (!canonicalSubject) {
      console.warn(
        '[AI RECOVERY] Subject mismatch:',
        {
          exam,
          received: subject
        }
      );

      throw Object.assign(
        new Error(
          'Beni Toparla planındaki bir ders takip müfredatıyla eşleşmedi. Yeniden dene.'
        ),
        { status: 502 }
      );
    }


    const allowedTopics =
      curriculum[exam]?.[
        canonicalSubject
      ] || [];


    const canonicalTopic =
      findCanonicalTopic(
        allowedTopics,
        topic
      );


    if (!canonicalTopic) {
      console.warn(
        '[AI RECOVERY] Topic mismatch:',
        {
          exam,
          subject:
            canonicalSubject,
          received: topic
        }
      );

      throw Object.assign(
        new Error(
          'Beni Toparla planındaki bir konu takip müfredatıyla eşleşmedi. Yeniden dene.'
        ),
        { status: 502 }
      );
    }


    cleanedTasks.push({
      exam,

      subject:
        canonicalSubject,

      topic:
        canonicalTopic.name,

      priority:
        ['high', 'medium', 'low']
          .includes(rawTask?.priority)
            ? rawTask.priority
            : 'medium',

      reason:
        text(
          rawTask?.reason,
          500
        )
    });
  }


  if (
    cleanedTasks.length < minTasks ||
    cleanedTasks.length > maxTasks
  ) {
    throw Object.assign(
      new Error(
        'Beni Toparla planındaki görev sayısı doğrulanamadı. Yeniden dene.'
      ),
      { status: 502 }
    );
  }


  /*
    Süreleri AI'a bırakmıyoruz.
    AI yalnızca görev ve öncelik seçiyor.
  */
  const priorityWeight = {
    high: 1.45,
    medium: 1,
    low: 0.72
  };


  const getRecoveryRules = task => {
    const label =
      normalizeProgramLabel(
        `${task.subject} ${task.topic}`
      );


    if (
      label.includes('paragraf')
    ) {
      return {
        min: 25,
        max: 40
      };
    }


    if (
      label.includes('matematik')
    ) {
      return {
        min: 45,
        max: 90
      };
    }


    if (
      label.includes('geometri') ||
      label.includes('ucgen')
    ) {
      return {
        min: 40,
        max: 75
      };
    }


    return {
      min: 30,
      max: 70
    };
  };


  const weighted =
    cleanedTasks.map(task => {
      const rules =
        getRecoveryRules(task);

      return {
        task,

        weight:
          priorityWeight[
            task.priority
          ] || 1,

        min:
          rules.min,

        max:
          rules.max
      };
    });


  const totalWeight =
    weighted.reduce(
      (sum, x) =>
        sum + x.weight,
      0
    ) || 1;


  weighted.forEach(x => {
    let minutes =
      Math.round(
        (
          targetMinutes *
          x.weight /
          totalWeight
        ) / 5
      ) * 5;


    minutes =
      Math.max(
        x.min,
        Math.min(
          x.max,
          minutes
        )
      );


    x.minutes =
      minutes;
  });


  /*
    Hedef süreye mümkün olduğunca yaklaş.
  */
  let currentTotal =
    weighted.reduce(
      (sum, x) =>
        sum + x.minutes,
      0
    );


  let safety = 0;


  while (
    currentTotal <
      targetMinutes - 5 &&
    safety < 500
  ) {
    safety++;


    const candidates =
      weighted
        .filter(
          x =>
            x.minutes + 5 <= x.max
        )
        .sort(
          (a, b) =>
            (
              b.weight *
              (b.max - b.minutes)
            ) -
            (
              a.weight *
              (a.max - a.minutes)
            )
        );


    if (!candidates.length) {
      break;
    }


    candidates[0].minutes += 5;
    currentTotal += 5;
  }


  safety = 0;


  while (
    currentTotal >
      targetMinutes + 5 &&
    safety < 500
  ) {
    safety++;


    const candidates =
      weighted
        .filter(
          x =>
            x.minutes - 5 >= x.min
        )
        .sort(
          (a, b) =>
            a.weight - b.weight
        );


    if (!candidates.length) {
      break;
    }


    candidates[0].minutes -= 5;
    currentTotal -= 5;
  }


  const tasks =
    weighted.map(x => ({
      exam:
        x.task.exam,

      subject:
        x.task.subject,

      topic:
        x.task.topic,

      minutes:
        x.minutes,

      reason:
        x.task.reason
    }));


  return res
    .status(200)
    .json({
      title:
        text(
          recovery.title,
          160
        ) ||
        'Bugünün Toparlanma Planı',

      summary:
        text(
          recovery.summary,
          1600
        ),

      hoursAvailable:
        hours,

      totalMinutes:
        tasks.reduce(
          (sum, task) =>
            sum + task.minutes,
          0
        ),

      tasks,

      tomorrowNote:
        text(
          recovery.tomorrowNote,
          800
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
