CREATE TABLE members (
 id uuid PRIMARY KEY, nickname varchar(20) NOT NULL UNIQUE, role varchar(20) NOT NULL,
 status varchar(20) NOT NULL, restricted_reason varchar(1000), created_at timestamptz NOT NULL
);
CREATE TABLE auth_tokens (
 token varchar(64) PRIMARY KEY, member_id uuid NOT NULL REFERENCES members(id),
 created_at timestamptz NOT NULL, last_used_at timestamptz NOT NULL
);
CREATE INDEX auth_tokens_member ON auth_tokens(member_id);
CREATE TABLE location_consents (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES members(id), policy_version varchar(100) NOT NULL,
 agreed_at timestamptz NOT NULL, withdrawn_at timestamptz
);
CREATE UNIQUE INDEX one_current_consent ON location_consents(member_id) WHERE withdrawn_at IS NULL;
