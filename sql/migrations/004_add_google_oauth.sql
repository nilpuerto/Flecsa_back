-- Add Google OAuth support to users table
ALTER TABLE users 
ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER email,
ADD COLUMN login_method ENUM('email', 'google') NOT NULL DEFAULT 'email' AFTER google_id,
ADD COLUMN avatar_url VARCHAR(500) NULL AFTER name;

-- Add index for Google ID lookups
CREATE INDEX idx_users_google_id ON users(google_id);

-- Update existing users to have email login method
UPDATE users SET login_method = 'email' WHERE login_method IS NULL;500
