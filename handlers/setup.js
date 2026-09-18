import crypto from 'node:crypto';

import { db } from '../lib/db.js';
import { schemaSql } from '../lib/schema.js';

import {
  onlyMethods,
  noStore
} from '../lib/http.js';


function safeEqual(a, b) {
  if (
    typeof a !== 'string' ||
    typeof b !== 'string'
  ) {
    return false;
  }

  const aBuffer =
    Buffer.from(a);

  const bBuffer =
    Buffer.from(b);

  if (
    aBuffer.length !==
    bBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
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

  noStore(res);


  /*
    Production'da setup endpointi
    varsayılan olarak tamamen kapalıdır.

    Gerçekten gerekirse geçici olarak:
    ALLOW_DB_SETUP=true
    verilmelidir.
  */
  if (
    process.env.NODE_ENV ===
      'production' &&
    process.env.ALLOW_DB_SETUP !==
      'true'
  ) {
    return res
      .status(404)
      .json({
        error:
          'Setup devre dışı.'
      });
  }


  const configured =
    (
      process.env.SETUP_SECRET ||
      ''
    ).trim();


  /*
    Zayıf / eksik setup secret ile
    endpoint çalışmaz.
  */
  if (
    configured.length < 32
  ) {
    return res
      .status(404)
      .json({
        error:
          'Setup devre dışı.'
      });
  }


  const supplied =
    typeof req.headers[
      'x-setup-secret'
    ] === 'string'
      ? req.headers[
          'x-setup-secret'
        ]
      : '';


  if (
    !safeEqual(
      supplied,
      configured
    )
  ) {
    return res
      .status(403)
      .json({
        error:
          'Setup anahtarı hatalı.'
      });
  }


  try {
    await db.query(
      schemaSql
    );

    return res
      .status(200)
      .json({
        ok: true,
        message:
          'YKS Master V2 tabloları hazır.'
      });

  } catch (err) {
    console.error(
      'Setup error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Veritabanı kurulamadı.'
      });
  }
}
