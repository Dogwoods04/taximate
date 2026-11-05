ALTER TABLE ride_rooms ADD COLUMN same_gender_only boolean NOT NULL DEFAULT false, ADD COLUMN restricted_gender varchar(16);
ALTER TABLE ride_rooms ADD CONSTRAINT room_gender_check CHECK ((same_gender_only AND restricted_gender IS NOT NULL AND restricted_gender IN ('MALE','FEMALE')) OR (NOT same_gender_only AND restricted_gender IS NULL));
