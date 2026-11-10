-- Every room is same-gender only. Running rooms without a recorded gender take their host's gender when it is
-- male/female; the rest keep a null gender, which the app now treats as closed to new members.
UPDATE ride_rooms r SET same_gender_only = true, restricted_gender = m.gender
FROM members m
WHERE m.id = r.host_member_id AND NOT r.same_gender_only AND m.gender IN ('MALE','FEMALE');
