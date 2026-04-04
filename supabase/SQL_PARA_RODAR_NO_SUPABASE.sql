-- =============================================
-- COLE ESTE SQL INTEIRO NO SUPABASE SQL EDITOR
-- Dashboard → SQL Editor → New Query → Cole → Run
-- =============================================

-- 1. Tabela de perfis (corretores e admins)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  role TEXT DEFAULT 'corretor' CHECK (role IN ('admin', 'corretor')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Trigger para criar perfil automaticamente ao cadastrar
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. Tabela de empreendimentos
CREATE TABLE empreendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  endereco TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  raio_metros INTEGER DEFAULT 550,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de check-ins
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id UUID REFERENCES profiles(id) NOT NULL,
  empreendimento_id UUID REFERENCES empreendimentos(id) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  distancia_metros DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valido', 'rejeitado')),
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Índice para evitar check-in duplicado no mesmo dia
CREATE UNIQUE INDEX idx_checkin_unico_dia
  ON checkins (corretor_id, empreendimento_id, (created_at::date))
  WHERE status = 'valido';

-- 6. Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE empreendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

-- 7. Policies: profiles
CREATE POLICY "Usuarios podem ver proprio perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins podem ver todos os perfis"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins podem atualizar perfis"
  ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 8. Policies: empreendimentos
CREATE POLICY "Todos autenticados podem ver empreendimentos ativos"
  ON empreendimentos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins podem gerenciar empreendimentos"
  ON empreendimentos FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 9. Policies: checkins
CREATE POLICY "Corretores podem ver proprios check-ins"
  ON checkins FOR SELECT
  USING (auth.uid() = corretor_id);

CREATE POLICY "Corretores podem criar check-ins"
  ON checkins FOR INSERT
  WITH CHECK (auth.uid() = corretor_id);

CREATE POLICY "Admins podem ver todos os check-ins"
  ON checkins FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 10. Inserir empreendimento Cenário dos Lagos
-- Coordenadas: -15.4233408, -56.0425525 | Raio: 550m
INSERT INTO empreendimentos (nome, endereco, latitude, longitude, raio_metros)
VALUES (
  'Cenário dos Lagos',
  'Cuiabá - MT',
  -15.4233408,
  -56.0425525,
  550
);
