CREATE TABLE trip_intents (
    id uuid PRIMARY KEY,
    requester_id uuid NOT NULL,
    status varchar(20) NOT NULL,
    origin_lat double precision, origin_lng double precision,
    origin_name varchar(100), origin_address varchar(200), origin_kind varchar(20), origin_provider_place_id varchar(64),
    destination_lat double precision, destination_lng double precision,
    destination_name varchar(100), destination_address varchar(200), destination_kind varchar(20), destination_provider_place_id varchar(64),
    desired_departure_at timestamptz NOT NULL,
    max_wait_minutes integer NOT NULL CHECK (max_wait_minutes BETWEEN 0 AND 60),
    max_detour_minutes integer NOT NULL CHECK (max_detour_minutes BETWEEN 0 AND 30),
    passenger_count integer NOT NULL CHECK (passenger_count BETWEEN 1 AND 3),
    route_snapshot_id uuid, route_error varchar(40), location_consent_reference uuid,
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, ended_at timestamptz,
    origin_geog geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(origin_lng, origin_lat),4326)::geography) STORED,
    destination_geog geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(destination_lng, destination_lat),4326)::geography) STORED,
    CHECK (status IN ('DRAFT','SEARCHING','NO_MATCH','MATCHED','CANCELLED','EXPIRED'))
);
CREATE INDEX trip_origin_geog_idx ON trip_intents USING gist(origin_geog);
CREATE INDEX trip_destination_geog_idx ON trip_intents USING gist(destination_geog);
CREATE INDEX trip_status_expiry_idx ON trip_intents(status, expires_at);
CREATE INDEX trip_ended_idx ON trip_intents(ended_at);
CREATE UNIQUE INDEX trip_one_active_per_member ON trip_intents(requester_id) WHERE status IN ('DRAFT','SEARCHING','NO_MATCH');

CREATE TABLE route_snapshots (
    id uuid PRIMARY KEY,
    trip_intent_id uuid NOT NULL REFERENCES trip_intents(id),
    provider varchar(20) NOT NULL,
    origin_lat double precision, origin_lng double precision,
    destination_lat double precision, destination_lng double precision,
    path_json text NOT NULL,
    distance_meters integer NOT NULL, duration_seconds integer NOT NULL,
    calculated_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
    provider_request_id varchar(255)
);
CREATE INDEX route_trip_idx ON route_snapshots(trip_intent_id);
ALTER TABLE trip_intents ADD CONSTRAINT trip_route_snapshot_fk FOREIGN KEY (route_snapshot_id) REFERENCES route_snapshots(id);
