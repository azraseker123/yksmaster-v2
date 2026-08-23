import { requireUser } from '../lib/auth.js';
import { onlyMethods, text } from '../lib/http.js';
import { db } from '../lib/db.js';
import { LICENSE_PACKAGES, accessFor, effectivePlan } from '../lib/plans.js';

const DAY_MS = 86400000;

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['GET', 'POST'])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const history = await db.query(
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
      packages: LICENSE_PACKAGES,
      access: user.access,
      expiresAt: user.plan_expires_at,
      history: history.rows
    });
  }

  const code = text(req.body?.code, 80).toUpperCase();

  if (!code) {
    return res.status(400).json({
      error: 'Lisans kodu gerekli.'
    });
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const userLock = await client.query(
      `SELECT *
       FROM yks2_users
       WHERE id = $1
       FOR UPDATE`,
      [user.id]
    );

    const lockedUser = userLock.rows[0];

    if (!lockedUser) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Kullanıcı bulunamadı.'
      });
    }

    const licenseResult = await client.query(
      `SELECT *
       FROM yks2_license_codes
       WHERE code = $1
       FOR UPDATE`,
      [code]
    );

    const license = licenseResult.rows[0];

    if (!license) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Lisans kodu bulunamadı.'
      });
    }

    if (license.used_by || license.used_at) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error: 'Bu lisans kodu daha önce kullanılmış.'
      });
    }

    if (
      license.assigned_email &&
      license.assigned_email.toLowerCase() !== lockedUser.email.toLowerCase()
    ) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        error: 'Bu kod başka bir e-posta için oluşturulmuş.'
      });
    }

    const packageInfo = LICENSE_PACKAGES[license.package_key];

    if (!packageInfo) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: 'Kodun paket türü geçersiz.'
      });
    }

    if (lockedUser.role === 'admin') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error:
          'Admin hesabı lisans kodu tüketmez. Paket testini Admin Test Modu üzerinden yap.'
      });
    }

    const currentPlan = effectivePlan(lockedUser);

    const now = new Date();

    const currentExpiry = asDate(
      lockedUser.plan_expires_at
    );

    const active =
      currentPlan !== 'none' &&
      currentExpiry &&
      currentExpiry > now;

    /*
     * Aktif AI Pro varken Temel pakete düşürmeye izin vermiyoruz.
     *
     * Böylece öğrenci yanlışlıkla daha düşük paket girip
     * mevcut Pro süresini kaybetmez.
     *
     * Lisans kodu da kullanılmamış kalır.
     */
    if (
      currentPlan === 'ai_pro' &&
      active &&
      packageInfo.plan === 'basic'
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error:
          'Aktif AI Pro paketin varken Temel paket kodu kullanamazsın. Kodunu AI Pro süren bittikten sonra kullanabilirsin.'
      });
    }

    let activationType = 'new';

    let startsAt = now;

    let baseDate = now;

    /*
     * AYNI PAKETİ YENİLEME
     *
     * Örneğin:
     * AI Pro'da 8 gün kaldı.
     * Öğrenci tekrar 30 günlük Pro aldı.
     *
     * Sonuç:
     * 8 + 30 = 38 gün
     */
    if (
      active &&
      currentPlan === packageInfo.plan
    ) {
      activationType = 'renewal';

      startsAt = currentExpiry;

      baseDate = currentExpiry;
    }

    /*
     * TEMEL -> AI PRO YÜKSELTME
     *
     * Öğrenci kalan Temel süresini kaybetmez.
     *
     * Örneğin:
     * Temel paketten 12 gün kaldı.
     * 30 günlük AI Pro satın aldı.
     *
     * Sonuç:
     * 12 + 30 = 42 gün AI Pro
     */
    else if (
      active &&
      currentPlan === 'basic' &&
      packageInfo.plan === 'ai_pro'
    ) {
      activationType = 'upgrade';

      startsAt = now;

      baseDate = currentExpiry;
    }

    const durationDays = Number(
      license.duration_days ||
      packageInfo.durationDays
    );

    const expiresAt = new Date(
      baseDate.getTime() +
      durationDays * DAY_MS
    );

    /*
     * Kullanıcının hesabı değişmez.
     * Sadece paket ve paket bitiş tarihi güncellenir.
     */
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
     * Lisans kodunu bu kullanıcıya kilitle.
     * Aynı kod ikinci kez kullanılamaz.
     */
    await client.query(
      `UPDATE yks2_license_codes
       SET
         used_by = $1,
         used_at = NOW()
       WHERE id = $2`,
      [
        lockedUser.id,
        license.id
      ]
    );

    /*
     * Abonelik geçmişini kaydet.
     */
    await client.query(
      `INSERT INTO yks2_subscription_events (
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10
      )`,
      [
        lockedUser.id,
        license.id,
        license.source_order_id || null,
        license.package_key,
        currentPlan,
        packageInfo.plan,
        active ? currentExpiry : null,
        startsAt,
        expiresAt,
        activationType
      ]
    );

    await client.query('COMMIT');

    const updatedUser = {
      ...lockedUser,
      plan: packageInfo.plan,
      plan_expires_at: expiresAt,
      effectivePlan: packageInfo.plan
    };

    return res.status(200).json({
      ok: true,
      package: license.package_key,
      plan: packageInfo.plan,
      activationType,
      expiresAt,
      access: accessFor(updatedUser)
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
      error: 'Lisans etkinleştirilemedi.'
    });

  } finally {
    client.release();
  }
}
