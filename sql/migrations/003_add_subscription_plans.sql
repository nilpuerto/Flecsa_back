-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
	id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(50) NOT NULL UNIQUE,
	display_name VARCHAR(100) NOT NULL,
	storage_limit_gb INT UNSIGNED NOT NULL,
	storage_limit_bytes BIGINT UNSIGNED NOT NULL,
	price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0.00,
	price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0.00,
	additional_gb_price DECIMAL(10,2) NOT NULL DEFAULT 4.99,
	features JSON NULL,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default plans
INSERT INTO subscription_plans (name, display_name, storage_limit_gb, storage_limit_bytes, price_monthly, price_yearly, additional_gb_price, features) VALUES
('free', 'Plan Gratuito', 5, 5368709120, 0.00, 0.00, 4.99, '["5GB de almacenamiento", "Búsqueda básica", "OCR estándar", "Soporte por email"]'),
('premium', 'Plan Premium', 10, 10737418240, 9.99, 99.99, 4.99, '["10GB de almacenamiento", "Búsqueda avanzada", "OCR de alta calidad", "Soporte prioritario", "API access", "Integraciones"]')
ON DUPLICATE KEY UPDATE
display_name = VALUES(display_name),
storage_limit_gb = VALUES(storage_limit_gb),
storage_limit_bytes = VALUES(storage_limit_bytes),
price_monthly = VALUES(price_monthly),
price_yearly = VALUES(price_yearly),
additional_gb_price = VALUES(additional_gb_price),
features = VALUES(features);
