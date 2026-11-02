package kr.siheung.taximate.identity.application;
import org.springframework.boot.context.properties.ConfigurationProperties;
@ConfigurationProperties("taximate.auth")
public record AuthProperties(boolean devLoginEnabled, String adminNicknames) {
    public AuthProperties { if (adminNicknames == null) adminNicknames = "admin"; }
}
