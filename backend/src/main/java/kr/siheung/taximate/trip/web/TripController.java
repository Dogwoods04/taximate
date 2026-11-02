package kr.siheung.taximate.trip.web;

import jakarta.validation.Valid;
import java.util.UUID;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.trip.application.TripService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/trips")
public class TripController {
    private final TripService trips;
    public TripController(TripService trips) { this.trips=trips; }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public TripResponse create(@CurrentMember AuthenticatedMember me, @Valid @RequestBody CreateTripRequest request) { return trips.create(me.memberId(),request); }
    @GetMapping("/active")
    public ResponseEntity<TripResponse> active(@CurrentMember AuthenticatedMember me) {
        var trip=trips.active(me.memberId()); return trip == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(trip);
    }
    @GetMapping("/{id}")
    public TripResponse get(@CurrentMember AuthenticatedMember me, @PathVariable UUID id) { return trips.ownedResponse(id,me.memberId()); }
    @PostMapping("/{id}/route")
    public TripResponse route(@CurrentMember AuthenticatedMember me, @PathVariable UUID id) { return trips.refresh(id,me.memberId()); }
    @PostMapping("/{id}/cancel")
    public TripResponse cancel(@CurrentMember AuthenticatedMember me, @PathVariable UUID id) { return trips.cancel(id,me.memberId()); }
}
