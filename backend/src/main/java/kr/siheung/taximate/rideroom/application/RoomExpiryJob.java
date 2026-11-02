package kr.siheung.taximate.rideroom.application;
import kr.siheung.taximate.common.lock.DistributedLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
@Component
public class RoomExpiryJob {
    private final RoomService rooms;
    private final DistributedLock locks;
    public RoomExpiryJob(RoomService rooms,DistributedLock locks) { this.rooms=rooms; this.locks=locks; }
    @Scheduled(fixedDelay=60000) public void expire() {
        for(var id:rooms.expiring()) locks.withLock("room:"+id,()->{ rooms.expire(id); return null; });
    }
}
