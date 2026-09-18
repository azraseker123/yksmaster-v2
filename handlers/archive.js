import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  text,
  int
} from '../lib/http.js';

import { query } from '../lib/db.js';
import { getCurriculumForField } from '../data/curriculum.js';

export default async function handler(req, res) {
  if (
    !onlyMethods(
      req,
      res,
      ['GET', 'POST', 'DELETE']
    )
  ) {
    return;
  }

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  const user =
    await requireUser(
      req,
      res,
      { paid: true }
    );

  if (!user) return;

  if (req.method === 'GET') {
    const imageParam =
      req.query?.image;

    if (imageParam !== undefined) {
      const imageId =
        int(
          imageParam,
          1,
          999999999999
        );

      if (!imageId) {
        return res.status(400).json({
          error:
            'Geçersiz görsel.'
        });
      }

      const imageResult =
        await query(
          `SELECT
            image_data,
            mime_type
           FROM yks2_mistake_archive
           WHERE id = $1
             AND user_id = $2
           LIMIT 1`,
          [
            imageId,
            user.id
          ]
        );

      if (!imageResult.rows.length) {
        return res
          .status(404)
          .end();
      }

      const row =
        imageResult.rows[0];

      const match =
        String(
          row.image_data || ''
        ).match(
          /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
        );

      if (!match) {
        return res
          .status(404)
          .end();
      }

      let imageBuffer;

      try {
        imageBuffer =
          Buffer.from(
            match[2],
            'base64'
          );
      } catch {
        return res
          .status(404)
          .end();
      }

      if (!imageBuffer.length) {
        return res
          .status(404)
          .end();
      }

      res.setHeader(
        'Content-Type',
        match[1]
      );

      res.setHeader(
        'Content-Length',
        String(
          imageBuffer.length
        )
      );

      res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
      );

      return res
        .status(200)
        .end(imageBuffer);
    }

    const subject =
      text(
        req.query?.subject,
        100
      );

    const params = [
      user.id
    ];

    let where =
      'user_id = $1';

    if (subject) {
      params.push(subject);

      where +=
        ' AND subject = $2';
    }

    const result =
      await query(
        `SELECT
          id,
          exam,
          subject,
          topic,
          source_name,
          note,
          mime_type,
          favorite,
          resolved,
          created_at
         FROM yks2_mistake_archive
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT 80`,
        params
      );

    return res.status(200).json({
      items:
        result.rows
    });
  }

  if (req.method === 'DELETE') {
    const id =
      int(
        req.query?.id,
        1,
        999999999999
      );

    if (!id) {
      return res.status(400).json({
        error:
          'Geçersiz arşiv kaydı.'
      });
    }

    const result =
      await query(
        `DELETE FROM yks2_mistake_archive
         WHERE id = $1
           AND user_id = $2
         RETURNING id`,
        [
          id,
          user.id
        ]
      );

    if (!result.rows.length) {
      return res.status(404).json({
        error:
          'Arşiv kaydı bulunamadı.'
      });
    }

    return res.status(200).json({
      ok: true
    });
  }

  const action =
    text(
      req.body?.action,
      30
    );

  if (
    [
      'toggleFavorite',
      'toggleResolved'
    ].includes(action)
  ) {
    const id =
      int(
        req.body?.id,
        1,
        999999999999
      );

    if (!id) {
      return res.status(400).json({
        error:
          'Geçersiz arşiv kaydı.'
      });
    }

    const column =
      action ===
      'toggleFavorite'
        ? 'favorite'
        : 'resolved';

    const result =
      await query(
        `UPDATE yks2_mistake_archive
         SET
           ${column} =
             NOT ${column}
         WHERE id = $1
           AND user_id = $2
         RETURNING
           id,
           ${column}`,
        [
          id,
          user.id
        ]
      );

    if (!result.rows.length) {
      return res.status(404).json({
        error:
          'Arşiv kaydı bulunamadı.'
      });
    }

    return res.status(200).json({
      item:
        result.rows[0]
    });
  }

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

  const topic =
    text(
      req.body?.topic,
      180
    );

  const sourceName =
    text(
      req.body?.sourceName,
      160
    );

  const note =
    text(
      req.body?.note,
      1000
    );

  const imageData =
    String(
      req.body?.imageData ||
      ''
    );

  const curriculum =
    getCurriculumForField(
      user.track
    );

  if (
    !['TYT', 'AYT'].includes(exam) ||
    !curriculum?.[exam]?.[subject]
  ) {
    return res.status(400).json({
      error:
        'Alanına uygun sınav ve ders seç.'
    });
  }

  if (
    topic &&
    !curriculum[exam][subject]
      .some(
        item =>
          item.name === topic
      )
  ) {
    return res.status(400).json({
      error:
        'Seçilen konu müfredat listesinde bulunmuyor.'
    });
  }

  const match =
    imageData.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
    );

  if (!match) {
    return res.status(400).json({
      error:
        'Yalnızca JPEG, PNG veya WEBP soru fotoğrafı yükleyebilirsin.'
    });
  }

  if (
    match[2].length >
    2_200_000
  ) {
    return res.status(413).json({
      error:
        'Fotoğraf çok büyük. Uygulama görseli küçültüp tekrar denemeli.'
    });
  }

  let imageBuffer;

  try {
    imageBuffer =
      Buffer.from(
        match[2],
        'base64'
      );
  } catch {
    return res.status(400).json({
      error:
        'Görsel verisi geçersiz.'
    });
  }

  if (
    !imageBuffer.length ||
    imageBuffer.length >
      1_700_000
  ) {
    return res.status(413).json({
      error:
        'Fotoğraf çok büyük veya geçersiz.'
    });
  }

  const mimeType =
    match[1];

  const result =
    await query(
      `INSERT INTO yks2_mistake_archive(
        user_id,
        exam,
        subject,
        topic,
        source_name,
        note,
        image_data,
        mime_type
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8
      )
      RETURNING
        id,
        exam,
        subject,
        topic,
        source_name,
        note,
        mime_type,
        favorite,
        resolved,
        created_at`,
      [
        user.id,
        exam,
        subject,
        topic,
        sourceName,
        note,
        imageData,
        mimeType
      ]
    );

  return res.status(201).json({
    item:
      result.rows[0]
  });
}
