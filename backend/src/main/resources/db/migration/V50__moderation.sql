CREATE TABLE reports (
 id uuid PRIMARY KEY, reporter_id uuid NOT NULL REFERENCES members(id), target_type varchar(20) NOT NULL,
 target_id uuid NOT NULL, reason varchar(20) NOT NULL, detail varchar(500), status varchar(20) NOT NULL,
 target_preview varchar(500), created_at timestamptz NOT NULL, resolved_at timestamptz,
 resolved_by uuid REFERENCES members(id), resolution_note varchar(1000)
);
CREATE INDEX reports_status_created ON reports(status,created_at);
CREATE TABLE moderation_actions (
 id uuid PRIMARY KEY, report_id uuid NOT NULL REFERENCES reports(id), admin_id uuid NOT NULL REFERENCES members(id),
 action varchar(30) NOT NULL, note varchar(1000), created_at timestamptz NOT NULL
);
