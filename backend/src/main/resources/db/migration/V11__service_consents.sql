CREATE TABLE service_consents (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES members(id), policy_version varchar(32) NOT NULL,
 items varchar(64) NOT NULL, -- comma-separated ServiceItem names, sorted, e.g. 'KAKAO,TMAP'
 agreed_at timestamptz NOT NULL, withdrawn_at timestamptz
);
CREATE UNIQUE INDEX one_current_service_consent ON service_consents(member_id) WHERE withdrawn_at IS NULL;
CREATE INDEX service_consents_member ON service_consents(member_id);
