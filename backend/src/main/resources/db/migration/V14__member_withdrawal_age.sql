-- Age confirmation (만 14세 이상) and account withdrawal (회원 탈퇴). members.status has no CHECK constraint;
-- the new value WITHDRAWN needs no DDL.
ALTER TABLE members ADD COLUMN age_confirmed_at timestamptz, ADD COLUMN withdrawn_at timestamptz;
