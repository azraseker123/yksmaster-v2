export const PLAN_FEATURES = {
  none: {
    label: 'Paket Yok', basic: false, ai: false, wrongAnalysis: false, duel: false, aiProgram: false
  },
  basic: {
    label: 'Temel', basic: true, ai: false, wrongAnalysis: false, duel: false, aiProgram: false
  },
  ai_pro: {
    label: 'AI Pro', basic: true, ai: true, wrongAnalysis: true, duel: true, aiProgram: true
  }
};

export const LICENSE_PACKAGES = {
  basic_monthly: { plan: 'basic', durationDays: 30, label: 'Temel - 30 Gün', priceLabel: '99 TL/ay' },
  ai_pro_monthly: { plan: 'ai_pro', durationDays: 30, label: 'AI Pro - 30 Gün', priceLabel: '299 TL/ay' },
  ai_pro_yearly: { plan: 'ai_pro', durationDays: 365, label: 'AI Pro - 365 Gün', priceLabel: '1299 TL/yıl' }
};

export function effectivePlan(user) {
  if (!user) return 'none';
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (user.role === 'admin' || (adminEmail && user.email?.toLowerCase() === adminEmail)) return 'ai_pro';
  if (!user.plan || user.plan === 'none' || !user.plan_expires_at) return 'none';
  return new Date(user.plan_expires_at).getTime() > Date.now() ? user.plan : 'none';
}

export function accessFor(user) {
  const forced = ['none','basic','ai_pro'].includes(user?.effectivePlan) ? user.effectivePlan : null;
  const plan = forced || effectivePlan(user);
  const f = PLAN_FEATURES[plan] || PLAN_FEATURES.none;
  return {
    plan,
    label: f.label,
    hasPaidAccess: f.basic,
    isPro: plan === 'ai_pro',
    canUseAi: f.ai,
    canUseWrongAnalysis: f.wrongAnalysis,
    canUseDuel: f.duel,
    canUseAiProgram: f.aiProgram
  };
}
