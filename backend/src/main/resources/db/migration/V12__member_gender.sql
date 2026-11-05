ALTER TABLE members ADD COLUMN gender varchar(16), ADD COLUMN gender_source varchar(16), ADD COLUMN gender_updated_at timestamptz;
ALTER TABLE members ADD CONSTRAINT members_gender_check CHECK (gender IN ('MALE','FEMALE','UNDISCLOSED')), ADD CONSTRAINT members_gender_source_check CHECK (gender_source IN ('SELF','KAKAO'));
