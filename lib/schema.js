export const schemaSql = `-- YKS Master V2.1 - PostgreSQL schema
-- V2 tables use the yks2_ prefix so the existing project tables are not overwritten.

CREATE TABLE IF NOT EXISTS yks2_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('sayisal','esit_agirlik','sozel')),
  target_city TEXT NOT NULL,
  target_university TEXT NOT NULL DEFAULT '',
  target_department TEXT NOT NULL,
  target_rank INTEGER NOT NULL CHECK (target_rank BETWEEN 1 AND 5000000),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  admin_preview_plan TEXT CHECK (admin_preview_plan IN ('none','basic','ai_pro')),
  plan TEXT NOT NULL DEFAULT 'none' CHECK (plan IN ('none','basic','ai_pro')),
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_yks2_users_email ON yks2_users(email);
CREATE INDEX IF NOT EXISTS idx_yks2_users_plan ON yks2_users(plan);
ALTER TABLE yks2_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE yks2_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS yks2_curriculum_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  exam TEXT NOT NULL CHECK (exam IN ('TYT','AYT')),
  subject TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  review_needed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, exam, subject, topic_id)
);

CREATE TABLE IF NOT EXISTS yks2_daily_plans (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  exam TEXT NOT NULL DEFAULT 'TYT' CHECK (exam IN ('TYT','AYT')),
  subject TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  target_minutes INTEGER NOT NULL DEFAULT 30 CHECK (target_minutes BETWEEN 1 AND 1440),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user','ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE yks2_daily_plans ADD COLUMN IF NOT EXISTS exam TEXT NOT NULL DEFAULT 'TYT';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_yks2_daily_plans_exam') THEN
    ALTER TABLE yks2_daily_plans ADD CONSTRAINT chk_yks2_daily_plans_exam CHECK (exam IN ('TYT','AYT'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_yks2_daily_plans_user_date ON yks2_daily_plans(user_id,plan_date);

CREATE TABLE IF NOT EXISTS yks2_exam_results (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('TYT','AYT')),
  exam_name TEXT NOT NULL,
  exam_date DATE NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_net NUMERIC(7,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yks2_exam_results_user_date ON yks2_exam_results(user_id,exam_date DESC);

CREATE TABLE IF NOT EXISTS yks2_resources (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exam TEXT NOT NULL DEFAULT 'TYT' CHECK (exam IN ('TYT','AYT')),
  subject TEXT NOT NULL,
  total_questions INTEGER CHECK (total_questions IS NULL OR total_questions >= 0),
  solved_questions INTEGER NOT NULL DEFAULT 0 CHECK (solved_questions >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  blank_count INTEGER NOT NULL DEFAULT 0 CHECK (blank_count >= 0),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE yks2_resources ADD COLUMN IF NOT EXISTS exam TEXT NOT NULL DEFAULT 'TYT';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_yks2_resources_exam') THEN
    ALTER TABLE yks2_resources ADD CONSTRAINT chk_yks2_resources_exam CHECK (exam IN ('TYT','AYT'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_yks2_resources_user_exam_subject ON yks2_resources(user_id,exam,subject);

CREATE TABLE IF NOT EXISTS yks2_question_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  exam TEXT NOT NULL CHECK (exam IN ('TYT','AYT')),
  subject TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  blank_count INTEGER NOT NULL DEFAULT 0 CHECK (blank_count >= 0),
  source_id BIGINT REFERENCES yks2_resources(id) ON DELETE SET NULL,
  log_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Europe/Istanbul')::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yks2_question_logs_user_date ON yks2_question_logs(user_id,log_date DESC);
CREATE INDEX IF NOT EXISTS idx_yks2_question_logs_subject ON yks2_question_logs(user_id,subject);

CREATE TABLE IF NOT EXISTS yks2_study_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Europe/Istanbul')::date),
  subject TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','pomodoro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yks2_study_sessions_user_date ON yks2_study_sessions(user_id,session_date DESC);

CREATE TABLE IF NOT EXISTS yks2_sleep_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  sleep_date DATE NOT NULL,
  bedtime TIME NOT NULL,
  wake_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  quality INTEGER CHECK (quality BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,sleep_date)
);

CREATE TABLE IF NOT EXISTS yks2_mistake_archive (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  exam TEXT NOT NULL CHECK (exam IN ('TYT','AYT')),
  subject TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  image_data TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yks2_mistakes_user_subject ON yks2_mistake_archive(user_id,subject);

CREATE TABLE IF NOT EXISTS yks2_user_badges (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,badge_key)
);

CREATE TABLE IF NOT EXISTS yks2_license_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  package_key TEXT NOT NULL CHECK (package_key IN ('basic_monthly','ai_pro_monthly','ai_pro_yearly')),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  assigned_email TEXT,
  used_by BIGINT REFERENCES yks2_users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  source_order_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yks2_license_codes_code ON yks2_license_codes(code);

CREATE TABLE IF NOT EXISTS yks2_duels (
  id BIGSERIAL PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  owner_user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  challenger_user_id BIGINT REFERENCES yks2_users(id) ON DELETE SET NULL,
  metric TEXT NOT NULL DEFAULT 'study_minutes' CHECK (metric IN ('study_minutes','questions')),
  title TEXT NOT NULL DEFAULT 'Haftalık Düello',
  starts_on DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Europe/Istanbul')::date),
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS idx_yks2_duels_users ON yks2_duels(owner_user_id,challenger_user_id);

CREATE TABLE IF NOT EXISTS yks2_ai_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yks2_ai_usage_user_action_date ON yks2_ai_usage(user_id,action,created_at DESC);

CREATE TABLE IF NOT EXISTS yks2_activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES yks2_users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Europe/Istanbul')::date),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yks2_activity_log_user_date ON yks2_activity_log(user_id,activity_date DESC);
`;
