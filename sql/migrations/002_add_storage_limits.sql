-- Add storage limits to users table
ALTER TABLE users 
ADD COLUMN subscription_plan ENUM('free', 'premium') NOT NULL DEFAULT 'free' AFTER name,
ADD COLUMN storage_used BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER subscription_plan,
ADD COLUMN storage_limit BIGINT UNSIGNED NOT NULL DEFAULT 5368709120 AFTER storage_used; -- 5GB en bytes

-- Update existing users to have free plan limits
UPDATE users SET 
  subscription_plan = 'free',
  storage_used = 0,
  storage_limit = 5368709120
WHERE subscription_plan IS NULL;
