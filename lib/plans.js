export const PLAN_FEATURES = {
  none: {
    label: 'Paket Yok',
    basic: false,
    ai: false,
    wrongAnalysis: false,
    duel: false,
    aiProgram: false
  },

  basic: {
    label: 'Temel',
    basic: true,
    ai: false,
    wrongAnalysis: false,
    duel: false,
    aiProgram: false
  },

  ai_pro: {
    label: 'AI Pro',
    basic: true,
    ai: true,
    wrongAnalysis: true,
    duel: true,
    aiProgram: true
  }
};


/*
  Satışta / manuel lisans üretiminde
  kullanılabilecek aktif paketler.

  Yıllık paket henüz fiyatlandırılmadığı için
  bilerek burada yer almıyor.
*/
export const LICENSE_PACKAGES = {
  basic_monthly: {
    plan: 'basic',
    durationDays: 30,
    label: 'Temel - 30 Gün',
    priceLabel: '99 TL/ay'
  },

  ai_pro_monthly: {
    plan: 'ai_pro',
    durationDays: 30,
    label: 'AI Pro - 30 Gün',
    priceLabel: '349 TL/ay'
  }
};


export function effectivePlan(user) {
  if (!user) {
    return 'none';
  }

  /*
    Admin yetkisinin tek kaynağı DB'deki
    role alanıdır.

    ADMIN_EMAIL burada kullanılmaz.
  */
  if (user.role === 'admin') {
    return 'ai_pro';
  }

  if (
    !['basic', 'ai_pro'].includes(
      user.plan
    )
  ) {
    return 'none';
  }

  if (!user.plan_expires_at) {
    return 'none';
  }

  const expiresAt =
    new Date(
      user.plan_expires_at
    ).getTime();

  if (
    !Number.isFinite(expiresAt)
  ) {
    return 'none';
  }

  if (
    expiresAt <= Date.now()
  ) {
    return 'none';
  }

  return user.plan;
}


export function accessFor(user) {
  /*
    auth.js admin test modunda
    user.effectivePlan değerini
    none / basic / ai_pro olarak
    geçici değiştirebilir.

    Bu nedenle geçerli bir effectivePlan
    varsa onu kullanıyoruz.
  */
  const forcedPlan =
    [
      'none',
      'basic',
      'ai_pro'
    ].includes(
      user?.effectivePlan
    )
      ? user.effectivePlan
      : null;

  const plan =
    forcedPlan ||
    effectivePlan(user);

  const features =
    PLAN_FEATURES[plan] ||
    PLAN_FEATURES.none;

  return {
    plan,

    label:
      features.label,

    hasPaidAccess:
      features.basic,

    isPro:
      plan === 'ai_pro',

    canUseAi:
      features.ai,

    canUseWrongAnalysis:
      features.wrongAnalysis,

    canUseDuel:
      features.duel,

    canUseAiProgram:
      features.aiProgram
  };
}
