package kr.siheung.taximate.identity.api;

public enum MemberStatus {
    /** Normal. */
    ACTIVE,
    /** Moderator restricted: cannot create trips/rooms, join, or send messages. Can still read. */
    RESTRICTED
}
