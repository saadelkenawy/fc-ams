-- Add subscription_tier to users
-- Existing users default to 'premium' to preserve prior behaviour during rollout.
-- Operators can run: UPDATE users SET subscription_tier = 'basic' WHERE <condition>
-- once actual subscription data is available.

ALTER TABLE users
  ADD COLUMN subscription_tier VARCHAR(20) NOT NULL DEFAULT 'premium'
    CONSTRAINT chk_users_subscription_tier CHECK (subscription_tier IN ('basic', 'standard', 'premium'));
