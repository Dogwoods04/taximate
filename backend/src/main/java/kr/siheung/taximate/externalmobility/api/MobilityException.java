package kr.siheung.taximate.externalmobility.api;

public class MobilityException extends RuntimeException {
    public enum Reason { QUOTA, NO_ROUTE, PROVIDER_ERROR }
    private final Reason reason;
    public MobilityException(Reason reason) {
        super("Mobility provider unavailable: " + reason);
        this.reason = reason;
    }
    public Reason reason() { return reason; }
}
