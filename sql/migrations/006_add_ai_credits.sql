-- Migration 006: Add AI credits to users table
-- This migration adds AI credits tracking to users

-- Add AI credits columns to users table
ALTER TABLE users 
ADD COLUMN ai_credits_used INT UNSIGNED NOT NULL DEFAULT 0 AFTER storage_limit,
ADD COLUMN ai_credits_limit INT UNSIGNED NOT NULL DEFAULT 100 AFTER ai_credits_used;

-- Update existing users with credits based on their plan
UPDATE users SET 
  ai_credits_limit = 100,
  ai_credits_used = 0
WHERE subscription_plan = 'free';

UPDATE users SET 
  ai_credits_limit = 800,
  ai_credits_used = 0
WHERE subscription_plan = 'starter';

UPDATE users SET 
  ai_credits_limit = 5000,
  ai_credits_used = 0
WHERE subscription_plan = 'business';













