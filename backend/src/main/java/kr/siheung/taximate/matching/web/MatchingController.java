package kr.siheung.taximate.matching.web;

import java.util.*;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.matching.application.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class MatchingController {
    private final MatchingService matching;
    private final MeetingPointService meetingPoints;
    public MatchingController(MatchingService matching,MeetingPointService meetingPoints) { this.matching=matching; this.meetingPoints=meetingPoints; }
    @GetMapping("/api/trips/{id}/candidates")
    public MatchCandidatesResponse candidates(@CurrentMember AuthenticatedMember me,@PathVariable UUID id) { return matching.candidates(id,me.memberId()); }
    @GetMapping("/api/rooms/{roomId}/meeting-point-suggestions")
    public List<MeetingPointSuggestion> suggestions(@CurrentMember AuthenticatedMember me,@PathVariable UUID roomId) { return meetingPoints.suggestions(roomId,me.memberId()); }
}
