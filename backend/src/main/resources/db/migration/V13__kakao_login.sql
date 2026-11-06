ALTER TABLE members ADD COLUMN kakao_id bigint UNIQUE, ADD COLUMN auth_provider varchar(16) NOT NULL DEFAULT 'DEV';
ALTER TABLE members ADD CONSTRAINT members_auth_provider_check CHECK (auth_provider IN ('DEV', 'KAKAO'));
