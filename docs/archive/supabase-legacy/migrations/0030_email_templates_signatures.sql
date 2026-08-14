-- 邮件模板表
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 邮件签名表
CREATE TABLE IF NOT EXISTS email_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_email_signatures_user_id ON email_signatures(user_id);

-- RLS 策略
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_signatures ENABLE ROW LEVEL SECURITY;

-- 邮件模板策略
DROP POLICY IF EXISTS "Users can view own templates" ON email_templates;
CREATE POLICY "Users can view own templates"
  ON email_templates FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own templates" ON email_templates;
CREATE POLICY "Users can insert own templates"
  ON email_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own templates" ON email_templates;
CREATE POLICY "Users can update own templates"
  ON email_templates FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own templates" ON email_templates;
CREATE POLICY "Users can delete own templates"
  ON email_templates FOR DELETE
  USING (auth.uid() = user_id);

-- 邮件签名策略
DROP POLICY IF EXISTS "Users can view own signatures" ON email_signatures;
CREATE POLICY "Users can view own signatures"
  ON email_signatures FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own signatures" ON email_signatures;
CREATE POLICY "Users can insert own signatures"
  ON email_signatures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own signatures" ON email_signatures;
CREATE POLICY "Users can update own signatures"
  ON email_signatures FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own signatures" ON email_signatures;
CREATE POLICY "Users can delete own signatures"
  ON email_signatures FOR DELETE
  USING (auth.uid() = user_id);

-- 实时同步
ALTER PUBLICATION supabase_realtime ADD TABLE email_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE email_signatures;
