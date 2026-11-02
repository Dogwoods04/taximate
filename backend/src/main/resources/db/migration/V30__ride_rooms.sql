CREATE TABLE ride_rooms (
 id uuid PRIMARY KEY, host_member_id uuid NOT NULL REFERENCES members(id), source_trip_id uuid NOT NULL,
 status varchar(20) NOT NULL, capacity integer NOT NULL CHECK(capacity BETWEEN 2 AND 4),
 departure_at timestamptz NOT NULL, departure_window_end timestamptz NOT NULL,
 fare_policy varchar(30) NOT NULL, luggage_allowed boolean NOT NULL, terms_note varchar(200),
 meeting_point_id varchar(64), meeting_point_name varchar(100), meeting_point_kind varchar(30),
 meeting_point_lat double precision, meeting_point_lng double precision, meeting_point_address varchar(200),
 terms_version integer NOT NULL, hidden boolean NOT NULL, version bigint NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, confirmed_at timestamptz, closed_at timestamptz
);
CREATE INDEX ride_rooms_source_trip ON ride_rooms(source_trip_id);
CREATE INDEX ride_rooms_expiry ON ride_rooms(status,departure_window_end);
CREATE TABLE room_participants (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES ride_rooms(id), member_id uuid NOT NULL REFERENCES members(id),
 trip_id uuid NOT NULL, role varchar(20) NOT NULL, status varchar(20) NOT NULL,
 passenger_count integer NOT NULL CHECK(passenger_count BETWEEN 1 AND 4), confirmed_terms_version integer,
 joined_at timestamptz NOT NULL, left_at timestamptz, UNIQUE(room_id,member_id)
);
CREATE INDEX room_participants_trip ON room_participants(trip_id);
