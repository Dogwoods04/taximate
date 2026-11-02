CREATE TABLE messages (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES ride_rooms(id), sender_id uuid REFERENCES members(id),
 type varchar(20) NOT NULL, body text NOT NULL, client_message_id varchar(100), hidden boolean NOT NULL,
 created_at timestamptz NOT NULL, UNIQUE(room_id,sender_id,client_message_id)
);
CREATE INDEX messages_room_created ON messages(room_id,created_at,id);
