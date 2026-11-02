package kr.siheung.taximate.matching.web;

import kr.siheung.taximate.common.place.MeetingPointDto;
import kr.siheung.taximate.externalmobility.api.WalkingRoutePort.WalkSource;
import kr.siheung.taximate.matching.web.MatchCandidatesResponse.Tier;

public record MeetingPointSuggestion(MeetingPointDto point,Tier tier,int maxWalkMeters,
        Double walkMinutesMax,WalkSource walkSource) {}
