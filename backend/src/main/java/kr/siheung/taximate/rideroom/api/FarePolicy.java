package kr.siheung.taximate.rideroom.api;

/** A stated principle only. The app never calculates or collects fares. */
public enum FarePolicy {
    EQUAL_SPLIT, DISTANCE_PRORATED, DISCUSS
}
