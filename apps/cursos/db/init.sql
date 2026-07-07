-- ============================================================
-- EduTech Platform — PostgreSQL Schema (App 1: Cursos)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(120) NOT NULL,
  email       VARCHAR(200) NOT NULL UNIQUE,
  rol         VARCHAR(20) NOT NULL DEFAULT 'estudiante' CHECK (rol IN ('estudiante','instructor','admin')),
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cursos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo         VARCHAR(200) NOT NULL,
  descripcion    TEXT,
  instructor     VARCHAR(120) NOT NULL,
  precio         NUMERIC(10,2) NOT NULL DEFAULT 0,
  duracion_horas INTEGER NOT NULL DEFAULT 0,
  nivel          VARCHAR(20) NOT NULL DEFAULT 'principiante' CHECK (nivel IN ('principiante','intermedio','avanzado')),
  categoria      VARCHAR(80) NOT NULL DEFAULT 'general',
  imagen_url     TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inscripciones (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curso_id          UUID NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  estudiante_id     UUID NOT NULL,
  nombre_estudiante VARCHAR(120),
  email_estudiante  VARCHAR(200),
  estado            VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','completada','cancelada')),
  progreso          INTEGER NOT NULL DEFAULT 0 CHECK (progreso BETWEEN 0 AND 100),
  fecha_inscripcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_completado  TIMESTAMPTZ
);

-- Índices de búsqueda frecuente
CREATE INDEX IF NOT EXISTS idx_cursos_categoria    ON cursos(categoria);
CREATE INDEX IF NOT EXISTS idx_cursos_nivel        ON cursos(nivel);
CREATE INDEX IF NOT EXISTS idx_cursos_activo       ON cursos(activo);
CREATE INDEX IF NOT EXISTS idx_inscripciones_curso ON inscripciones(curso_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_est   ON inscripciones(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_estado ON inscripciones(estado);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cursos_updated_at    BEFORE UPDATE ON cursos    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_usuarios_updated_at  BEFORE UPDATE ON usuarios  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Datos de ejemplo
INSERT INTO cursos (titulo, descripcion, instructor, precio, duracion_horas, nivel, categoria) VALUES
  ('Introducción a Python', 'Aprende Python desde cero con proyectos prácticos', 'Dr. Ana García', 49.99, 40, 'principiante', 'programacion'),
  ('React Avanzado', 'Hooks, Context API, performance y patrones modernos', 'Ing. Carlos López', 89.99, 60, 'avanzado', 'frontend'),
  ('Arquitectura de Software', 'Patrones, microservicios y diseño de sistemas escalables', 'Mg. María Torres', 129.99, 80, 'avanzado', 'arquitectura'),
  ('Machine Learning con TensorFlow', 'Redes neuronales y deep learning aplicado', 'Dr. Roberto Silva', 99.99, 70, 'intermedio', 'data-science'),
  ('Docker y Kubernetes', 'Containerización y orquestación de microservicios', 'Ing. Laura Pérez', 79.99, 50, 'intermedio', 'devops')
ON CONFLICT DO NOTHING;
