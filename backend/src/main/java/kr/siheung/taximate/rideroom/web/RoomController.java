package kr.siheung.taximate.rideroom.web;
import jakarta.validation.Valid;
import java.util.UUID;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.common.lock.DistributedLock;
import kr.siheung.taximate.rideroom.application.RoomService;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/rooms")
public class RoomController {
    private final RoomService service;
    private final DistributedLock locks;
    public RoomController(RoomService service,DistributedLock locks) { this.service=service; this.locks=locks; }
    @PostMapping @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Object create(@CurrentMember AuthenticatedMember me,@Valid @RequestBody RoomRequests.Create r) { return service.create(me.memberId(),r); }
    @GetMapping("/mine") public Object mine(@CurrentMember AuthenticatedMember me) { return service.mine(me.memberId()); }
    @GetMapping("/open")
    public Object open(@CurrentMember AuthenticatedMember me,
            @RequestParam(required=false) Double lat,@RequestParam(required=false) Double lng) {
        return service.open(me.memberId(),lat,lng);
    }
    @GetMapping("/{id}") public Object detail(@CurrentMember AuthenticatedMember me,@PathVariable UUID id) { return service.detail(id,me.memberId()); }
    @PostMapping("/{id}/join") public Object join(@CurrentMember AuthenticatedMember me,@PathVariable UUID id,@Valid @RequestBody RoomRequests.Join r) { return locks.withLock("room:"+id,()->service.join(id,me.memberId(),r.tripId())); }
    @PostMapping("/{id}/confirm") public Object confirm(@CurrentMember AuthenticatedMember me,@PathVariable UUID id,@Valid @RequestBody RoomRequests.Confirm r) { return locks.withLock("room:"+id,()->service.confirm(id,me.memberId(),r.termsVersion())); }
    @PutMapping("/{id}/plan") public Object plan(@CurrentMember AuthenticatedMember me,@PathVariable UUID id,@Valid @RequestBody RoomRequests.Plan r) { return locks.withLock("room:"+id,()->service.plan(id,me.memberId(),r)); }
    @PostMapping("/{id}/leave") public Object leave(@CurrentMember AuthenticatedMember me,@PathVariable UUID id) { return locks.withLock("room:"+id,()->service.leave(id,me.memberId())); }
    @PostMapping("/{id}/participants/{memberId}/remove") public Object remove(@CurrentMember AuthenticatedMember me,@PathVariable UUID id,@PathVariable UUID memberId) { return locks.withLock("room:"+id,()->service.remove(id,me.memberId(),memberId)); }
    @PostMapping("/{id}/cancel") public Object cancel(@CurrentMember AuthenticatedMember me,@PathVariable UUID id) { return locks.withLock("room:"+id,()->service.cancel(id,me.memberId())); }
    @PostMapping("/{id}/close") public Object close(@CurrentMember AuthenticatedMember me,@PathVariable UUID id) { return locks.withLock("room:"+id,()->service.close(id,me.memberId())); }
}
