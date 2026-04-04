-- =============================================
-- LIMPAR SCHEMA ANTIGO (se existir)
-- =============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS checkin_date(TIMESTAMPTZ);
DROP TABLE IF EXISTS checkins CASCADE;
DROP TABLE IF EXISTS empreendimentos CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- =============================================
-- Cenario dos Lagos - Schema Novo
-- Auth propria via nome+CRECI (sem Supabase Auth)
-- =============================================

CREATE TABLE corretores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  creci TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'corretor' CHECK (role IN ('admin', 'corretor')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id UUID REFERENCES corretores(id) NOT NULL,
  empreendimento_id UUID REFERENCES empreendimentos(id) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  distancia_metros DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valido', 'rejeitado')),
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Funcao para data no fuso de Cuiaba
CREATE OR REPLACE FUNCTION checkin_date(ts TIMESTAMPTZ)
RETURNS DATE AS $$
  SELECT (ts AT TIME ZONE 'America/Cuiaba')::date;
$$ LANGUAGE sql IMMUTABLE;

-- Um check-in valido por corretor/empreendimento/dia
CREATE UNIQUE INDEX idx_checkin_unico_dia
  ON checkins (corretor_id, empreendimento_id, checkin_date(created_at))
  WHERE status = 'valido';

-- Indices uteis
CREATE INDEX idx_corretores_creci ON corretores (creci);
CREATE INDEX idx_checkins_corretor ON checkins (corretor_id);
CREATE INDEX idx_checkins_data ON checkins (created_at DESC);

-- RLS desabilitado (auth e via JWT no servidor)
ALTER TABLE corretores DISABLE ROW LEVEL SECURITY;
ALTER TABLE empreendimentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE checkins DISABLE ROW LEVEL SECURITY;

-- Inserir empreendimento
INSERT INTO empreendimentos (nome, endereco, latitude, longitude, raio_metros)
VALUES (
  'Cenario dos Lagos',
  'Rod. MT-351, Rotatoria do Manso, Cuiaba-MT',
  -15.4233408,
  -56.0425525,
  550
);
