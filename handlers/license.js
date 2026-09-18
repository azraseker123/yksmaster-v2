import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  text,
  noStore
} from '../lib/http.js';

import { db } from '../lib/db.js';

import {
  LICENSE_PACKAGES,
  accessFor,
  effectivePlan
} from '../lib/plans.js';

const DAY_MS = 86400000;

function asDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

export default async function handler(
  req,
  res
) {
  if (
    !onlyMethods(
      req,
      res,
      ['GET', 'POST']
    )
  ) {
    return;
  }

  noStore(res);

  const user =
    await requireUser(
      req,
      res
    );

  if (!user) return;

  if (req.method === 'GET') {
    const history =
      await db.query(
        `SELECT
          id,
          package_key,
          previous_plan,
          new_plan,
          previous_expires_at,
          starts_at,
          expires_at,
          activation_type,
          created_at
         FROM yks2_subscription_events
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.id]
      );

    return res.status(200).json({
      packages:
        LICENSE_PACKAGES,

      access:
        user.access,

      expiresAt:
        user.plan_expires_at,

      history:
        history.rows
    });
  }

  const code =
    text(
      req.body?.code,
      80
    ).toUpperCase();

  if (!code) {
    return res.status(400).json({
      error:
        'Lisans kodu gerekli.'
    });
  }

  const client =
    await db.connect();

  try {
    await client.query(
      'BEGIN'
    );

    const userResult =
      await client.query(
        `SELECT
          id,
          email,
          role,
          plan,
          plan_expires_at
         FROM yks2_users
         WHERE id = $1
         FOR UPDATE`,
        [user.id]
      );

    const lockedUser =
      userResult.rows[0];

    if (!lockedUser) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({
        error:
          'Kullanıcı bulunamadı.'
      });
    }

    /*
      Admin hesabı hiçbir lisans kodunu
      tüketmez.
    */
    if (
      lockedUser.role === 'admin'
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(409).json({
        error:
          'Admin hesabı lisans kodu tüketmez. Paket testini Admin Test Modu üzerinden yap.'
      });
    }

    const licenseResult =
      await client.query(
        `SELECT
          id,
          code,
          package_key,
          duration_days,
          assigned_email,
          used_by,
          used_at,
          source_order_id
         FROM yks2_license_codes
         WHERE code = $1
         FOR UPDATE`,
        [code]
      );

    const license =
      licenseResult.rows[0];

    if (!license) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({
        error:
          'Lisans kodu bulunamadı.'
      });
    }

    if (
      license.used_by ||
      license.used_at
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(409).json({
        error:
          'Bu lisans kodu daha önce kullanılmış.'
      });
    }

    if (
      license.assigned_email &&
      license.assigned_email
        .trim()
        .toLowerCase() !==
        lockedUser.email
          .trim()
          .toLowerCase()
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(403).json({
        error:
          'Bu kod başka bir e-posta için oluşturulmuş.'
      });
    }

    /*
      Paket mutlaka şu an uygulamada
      aktif olan paketlerden biri olmalı.

      Böylece eski ai_pro_yearly kodları
      yıllık paket tekrar açılana kadar
      kullanılamaz.
    */
    const packageInfo =
      LICENSE_PACKAGES[
        license.package_key
      ];

    if (!packageInfo) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'Bu lisans paketinin kullanımı şu anda aktif değil.'
      });
    }

    const durationDays =
      Number(
        license.duration_days
      );

    if (
      !Number.isInteger(
        durationDays
      ) ||
      durationDays <= 0 ||
      durationDays > 3650
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'Lisans süresi geçersiz.'
      });
    }

    const currentPlan =
      effectivePlan(
        lockedUser
      );

    const now =
      new Date();

    const currentExpiry =
      asDate(
        lockedUser.plan_expires_at
      );

    const active =
      currentPlan !== 'none' &&
      currentExpiry &&
      currentExpiry > now;

    /*
      Aktif AI Pro varken Basic kodu
      mevcut Pro erişimini düşürmesin.
    */
    if (
      currentPlan === 'ai_pro' &&
      active &&
      packageInfo.plan === 'basic'
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(409).json({
        error:
          'Aktif AI Pro paketin varken Temel paket kodu kullanamazsın. Kodunu AI Pro süren bittikten sonra kullanabilirsin.'
      });
    }

    let activationType =
      'new';

    let startsAt =
      now;

    let baseDate =
      now;

    /*
      Aynı paket yenileniyorsa kalan süre
      korunur.
    */
    if (
      active &&
      currentPlan ===
        packageInfo.plan
    ) {
      activationType =
        'renewal';

      startsAt =
        currentExpiry;

      baseDate =
        currentExpiry;
    }

    /*
      Basic -> AI Pro yükseltmede
      mevcut Basic süresi kaybolmaz.
    */
    else if (
      active &&
      currentPlan === 'basic' &&
      packageInfo.plan === 'ai_pro'
    ) {
      activationType =
        'upgrade';

      startsAt =
        now;

      baseDate =
        currentExpiry;
    }

    const expiresAt =
      new Date(
        baseDate.getTime() +
        durationDays *
          DAY_MS
      );

    await client.query(
      `UPDATE yks2_users
       SET
         plan = $1,
         plan_expires_at = $2,
         updated_at = NOW()
       WHERE id = $3`,
      [
        packageInfo.plan,
        expiresAt,
        lockedUser.id
      ]
    );

    /*
      Kod tüketilir.
    */
    const usedResult =
      await client.query(
        `UPDATE yks2_license_codes
         SET
           used_by = $1,
           used_at = NOW()
         WHERE id = $2
           AND used_by IS NULL
           AND used_at IS NULL
         RETURNING id`,
        [
          lockedUser.id,
          license.id
        ]
      );

    if (
      !usedResult.rows.length
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(409).json({
        error:
          'Bu lisans kodu daha önce kullanılmış.'
      });
    }

    await client.query(
      `INSERT INTO yks2_subscription_events(
        user_id,
        license_code_id,
        source_order_id,
        package_key,
        previous_plan,
        new_plan,
        previous_expires_at,
        starts_at,
        expires_at,
        activation_type
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
      )`,
      [
        lockedUser.id,
        license.id,
        license.source_order_id ||
          null,
        license.package_key,
        currentPlan,
        packageInfo.plan,
        active
          ? currentExpiry
          : null,
        startsAt,
        expiresAt,
        activationType
      ]
    );

    await client.query(
      'COMMIT'
    );

    const updatedUser = {
      ...lockedUser,

      plan:
        packageInfo.plan,

      plan_expires_at:
        expiresAt,

      effectivePlan:
        packageInfo.plan
    };

    return res.status(200).json({
      ok: true,

      package:
        license.package_key,

      plan:
        packageInfo.plan,

      activationType,

      expiresAt,

      access:
        accessFor(
          updatedUser
        )
    });

  } catch (err) {
    await client
      .query('ROLLBACK')
      .catch(() => {});

    console.error(
      'License error:',
      err
    );

    return res.status(500).json({
      error:
        'Lisans etkinleştirilemedi.'
    });

  } finally {
    client.release();
  }
}
