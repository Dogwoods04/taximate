package kr.siheung.taximate.identity.application;
import org.springframework.boot.context.properties.ConfigurationProperties;
/**
 * @param devLoginNicknamePrefix when non-blank, nickname (dev) login accepts only nicknames starting with it
 *                               (demo accounts) or listed in adminNicknames; empty = no restriction.
 */
@ConfigurationProperties("taximate.auth")
public record AuthProperties(boolean devLoginEnabled, String adminNicknames, String devLoginNicknamePrefix) {
    public AuthProperties {
        if (adminNicknames == null) adminNicknames = "admin";
        devLoginNicknamePrefix = devLoginNicknamePrefix == null ? "" : devLoginNicknamePrefix.trim();
    }
    /** The configured prefix, or null when dev login is unrestricted. */
    public String devLoginPrefix() { return devLoginNicknamePrefix.isEmpty() ? null : devLoginNicknamePrefix; }
}
