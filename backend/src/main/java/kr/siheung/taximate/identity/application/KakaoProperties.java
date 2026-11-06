package kr.siheung.taximate.identity.application;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("taximate.auth.kakao")
public record KakaoProperties(Boolean enabled, String restApiKey, String clientSecret,
        List<String> allowedRedirectUris, String authBaseUrl, String apiBaseUrl) {
    public KakaoProperties {
        restApiKey = restApiKey == null ? "" : restApiKey;
        enabled = enabled == null ? !restApiKey.isBlank() : enabled;
        clientSecret = clientSecret == null ? "" : clientSecret;
        allowedRedirectUris = allowedRedirectUris == null ? List.of("http://localhost:5173/auth/kakao", "http://127.0.0.1:5173/auth/kakao") : List.copyOf(allowedRedirectUris);
        authBaseUrl = authBaseUrl == null ? "https://kauth.kakao.com" : authBaseUrl;
        apiBaseUrl = apiBaseUrl == null ? "https://kapi.kakao.com" : apiBaseUrl;
    }
    public boolean available() { return enabled && !restApiKey.isBlank(); }
}
