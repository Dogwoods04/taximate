package kr.siheung.taximate.common.demo;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps demo rooms alive for UX testing. Disabled unless {@code taximate.demo.keep-alive-prefix} is set
 * (e.g. DEMO_KEEPALIVE_PREFIX=샘플 in backend/.env). Rooms whose host nickname starts with the prefix:
 * <ul>
 *   <li>when departure gets within 20 minutes, it moves to 60–150 minutes from now (stable per room), together with
 *       the room's window and the host/member trips, so they stay listed and matchable (±30 min rule);</li>
 *   <li>their route snapshots never expire, so candidate scoring keeps working.</li>
 * </ul>
 * Real users' rooms are never touched.
 */
@Component
public class DemoKeepAlive {
    private static final Logger log = LoggerFactory.getLogger(DemoKeepAlive.class);
    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    private final String prefix;

    public DemoKeepAlive(NamedParameterJdbcTemplate jdbc, Clock clock, @Value("${taximate.demo.keep-alive-prefix:}") String prefix) {
        this.jdbc = jdbc; this.clock = clock; this.prefix = prefix == null ? "" : prefix.trim();
    }

    /**
     * Runs once while the context starts — before the room/trip expiry jobs' first tick — so demo rooms survive
     * the backend having been off for hours (e.g. overnight). Plain JDBC statements, auto-committed.
     */
    @jakarta.annotation.PostConstruct
    void onStartup() {
        try { keepAlive(); } catch (RuntimeException e) { log.warn("demo keep-alive at startup failed: {}", e.toString()); }
    }

    @Scheduled(initialDelay = 300_000, fixedDelay = 300_000)
    @Transactional
    public void keepAlive() {
        if (prefix.isEmpty()) return;
        OffsetDateTime now = OffsetDateTime.now(clock);
        var params = Map.<String, Object>of("prefix", prefix + "%", "soon", Timestamp.from(now.plusMinutes(20).toInstant()));

        // Trips that belong to live demo rooms (host source trip + active members' trips).
        String demoTrips = """
                select r.source_trip_id from ride_rooms r join members m on m.id = r.host_member_id
                 where m.nickname like :prefix and r.status in ('OPEN','COORDINATING')
                union
                select p.trip_id from room_participants p join ride_rooms r on r.id = p.room_id
                  join members m on m.id = r.host_member_id
                 where m.nickname like :prefix and r.status in ('OPEN','COORDINATING') and p.status = 'ACTIVE'
                """;
        jdbc.update("update route_snapshots set expires_at = now() + interval '1 day' where id in "
                + "(select route_snapshot_id from trip_intents where id in (" + demoTrips + ") and route_snapshot_id is not null)", params);

        List<Map<String, Object>> due = jdbc.queryForList("""
                select r.id, r.source_trip_id from ride_rooms r join members m on m.id = r.host_member_id
                 where m.nickname like :prefix and r.status in ('OPEN','COORDINATING') and r.departure_at < cast(:soon as timestamptz)
                """, params);
        for (Map<String, Object> row : due) {
            UUID roomId = (UUID) row.get("id");
            int minutes = 60 + Math.floorMod(roomId.hashCode(), 91);
            Timestamp departure = Timestamp.from(now.plusMinutes(minutes).toInstant());
            var p = Map.<String, Object>of("room", roomId, "dep", departure);
            jdbc.update("""
                    update trip_intents t set desired_departure_at = cast(:dep as timestamptz),
                           expires_at = cast(:dep as timestamptz) + make_interval(mins => t.max_wait_minutes)
                     where t.id in (select source_trip_id from ride_rooms where id = :room
                                    union select trip_id from room_participants where room_id = :room and status = 'ACTIVE')
                    """, p);
            jdbc.update("""
                    update ride_rooms r set departure_at = cast(:dep as timestamptz),
                           departure_window_end = cast(:dep as timestamptz) + make_interval(mins => (select max_wait_minutes from trip_intents where id = r.source_trip_id))
                     where r.id = :room
                    """, p);
        }
        if (!due.isEmpty()) log.info("demo keep-alive: moved {} room(s) forward", due.size());
    }
}
