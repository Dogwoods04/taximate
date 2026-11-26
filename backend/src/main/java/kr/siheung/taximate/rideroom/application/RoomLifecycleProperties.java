package kr.siheung.taximate.rideroom.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param confirmedAutoCloseMinutes a CONFIRMED room nobody finished is closed this long after its departure window
 *                                  ends, so a forgotten ride never keeps members from their next one
 */
@ConfigurationProperties("taximate.rooms.lifecycle")
public record RoomLifecycleProperties(@DefaultValue("180") int confirmedAutoCloseMinutes) {
    public RoomLifecycleProperties {
        if (confirmedAutoCloseMinutes <= 0) throw new IllegalArgumentException("Invalid taximate.rooms.lifecycle settings");
    }
}
