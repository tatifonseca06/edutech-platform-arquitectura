-- ============================================================
-- EduTech Platform — MySQL Schema (App 3: Notificaciones)
-- ============================================================

CREATE TABLE IF NOT EXISTS notificaciones (
  id             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  tipo           VARCHAR(30)      NOT NULL COMMENT 'email, sms, push',
  destinatario   VARCHAR(200)     NOT NULL COMMENT 'email o número de teléfono',
  asunto         VARCHAR(300)     NULL,
  estado         ENUM('pendiente','enviado','fallido') NOT NULL DEFAULT 'pendiente',
  intentos       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  payload        JSON             NULL COMMENT 'Datos completos del evento original',
  fecha_creacion DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_envio    DATETIME         NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para queries frecuentes
CREATE INDEX idx_notif_user_tipo_estado
  ON notificaciones (destinatario(100), tipo, estado);

CREATE INDEX idx_notif_estado
  ON notificaciones (estado, fecha_creacion);

CREATE INDEX idx_notif_fecha
  ON notificaciones (fecha_creacion);

-- Datos de prueba
INSERT INTO notificaciones (tipo, destinatario, asunto, estado, intentos) VALUES
  ('email', 'test@ejemplo.com', 'Bienvenido a EduTech', 'enviado', 1),
  ('email', 'test2@ejemplo.com', 'Inscripción: Python desde cero', 'enviado', 1);
