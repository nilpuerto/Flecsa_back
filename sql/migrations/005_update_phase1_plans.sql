-- Migration 005: Update to Phase 1 plans (Free, Starter, Business)
-- This migration updates the database to reflect the new subscription plans and features

-- 1. Update users table: Change subscription_plan ENUM and update storage limits
ALTER TABLE users 
MODIFY COLUMN subscription_plan ENUM('free', 'starter', 'business') NOT NULL DEFAULT 'free';

-- Update existing users with 'premium' plan to 'starter'
UPDATE users SET subscription_plan = 'starter' WHERE subscription_plan = 'premium';

-- Update storage limits for existing users based on their plan
UPDATE users SET storage_limit = 26843545600 WHERE subscription_plan = 'free'; -- 25GB
UPDATE users SET storage_limit = 536870912000 WHERE subscription_plan = 'starter'; -- 500GB
UPDATE users SET storage_limit = 2147483648000 WHERE subscription_plan = 'business'; -- 2000GB

-- Ensure all existing users have login_method = 'email'
UPDATE users SET login_method = 'email' WHERE login_method IS NULL;

-- 2. Update subscription_plans table with Phase 1 plans
-- Delete old plans that don't match
DELETE FROM subscription_plans WHERE name NOT IN ('free', 'starter', 'business');

-- Update/Create Free plan: 25GB, 100 créditos IA/mes, 0€
INSERT INTO subscription_plans (
  name, 
  display_name, 
  storage_limit_gb, 
  storage_limit_bytes, 
  price_monthly, 
  price_yearly, 
  additional_gb_price, 
  features, 
  is_active
) VALUES (
  'free',
  'Plan Gratuito',
  25,
  26843545600, -- 25GB in bytes
  0.00,
  0.00,
  0.00,
  JSON_ARRAY(
    '25GB de almacenamiento seguro',
    '100 créditos de IA al mes',
    'Búsqueda inteligente ilimitada',
    'Organización automática',
    'Acceso multi-dispositivo'
  ),
  true
) ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  storage_limit_gb = VALUES(storage_limit_gb),
  storage_limit_bytes = VALUES(storage_limit_bytes),
  price_monthly = VALUES(price_monthly),
  price_yearly = VALUES(price_yearly),
  features = VALUES(features),
  is_active = VALUES(is_active);

-- Update/Create Starter plan: 500GB, 800 créditos IA/mes, 6,99€
INSERT INTO subscription_plans (
  name,
  display_name,
  storage_limit_gb,
  storage_limit_bytes,
  price_monthly,
  price_yearly,
  additional_gb_price,
  features,
  is_active
) VALUES (
  'starter',
  'Plan Starter',
  500,
  536870912000, -- 500GB in bytes
  6.99,
  69.90, -- Approx 10 months
  0.00,
  JSON_ARRAY(
    '500GB de almacenamiento',
    '800 créditos de IA al mes',
    'Todas las funciones del plan Gratuito',
    'Todas las instrucciones de IA',
    'Exportación avanzada (PDF, CSV, JSON)',
    'Soporte prioritario'
  ),
  true
) ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  storage_limit_gb = VALUES(storage_limit_gb),
  storage_limit_bytes = VALUES(storage_limit_bytes),
  price_monthly = VALUES(price_monthly),
  price_yearly = VALUES(price_yearly),
  features = VALUES(features),
  is_active = VALUES(is_active);

-- Update/Create Business plan: 2000GB, 5000 créditos IA/mes por usuario, 49,99€/mes por usuario
INSERT INTO subscription_plans (
  name,
  display_name,
  storage_limit_gb,
  storage_limit_bytes,
  price_monthly,
  price_yearly,
  additional_gb_price,
  features,
  is_active
) VALUES (
  'business',
  'Plan Business',
  2000,
  2147483648000, -- 2000GB in bytes
  49.99,
  499.90, -- Approx 10 months
  0.00,
  JSON_ARRAY(
    '2000GB de almacenamiento',
    '5000 créditos de IA al mes por usuario',
    'Todas las funciones de Starter',
    'Espacios compartidos y roles',
    'Moderación inteligente y API profesional',
    'Integraciones con Google, Notion, Slack y más',
    'Panel de administración completo',
    'Hasta 10 empleados con un pago'
  ),
  true
) ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  storage_limit_gb = VALUES(storage_limit_gb),
  storage_limit_bytes = VALUES(storage_limit_bytes),
  price_monthly = VALUES(price_monthly),
  price_yearly = VALUES(price_yearly),
  features = VALUES(features),
  is_active = VALUES(is_active);

-- 3. Add comment to documents table about Ollama3 for embeddings
ALTER TABLE documents 
MODIFY COLUMN meta JSON NULL COMMENT 'Metadata del documento. En el futuro se utilizará Ollama3 para embeddings locales (KNN/BM25)';

-- 4. Add comment to ocr_results about future embedding_vector optimization
ALTER TABLE ocr_results
MODIFY COLUMN json JSON NULL COMMENT 'Resultados OCR en JSON. Considerar futuro campo embedding_vector para optimización semántica con Ollama3';

-- 5. Ensure all plans are marked as active
UPDATE subscription_plans SET is_active = true WHERE name IN ('free', 'starter', 'business');



