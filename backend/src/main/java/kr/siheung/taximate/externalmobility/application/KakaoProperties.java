package kr.siheung.taximate.externalmobility.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("taximate.kakao")
public record KakaoProperties(String mode, String restApiKey, String localBaseUrl,
                              String mobilityBaseUrl, int timeoutMillis) {
    public KakaoProperties {
        if (mode == null) mode = "mock";
        if (!mode.equals("mock") && !mode.equals("kakao")) throw new IllegalArgumentException("taximate.kakao.mode must be mock or kakao");
        if (mode.equals("kakao") && (restApiKey == null || restApiKey.isBlank()))
            throw new IllegalArgumentException("KAKAO_REST_API_KEY is required when taximate.kakao.mode=kakao");
        if (localBaseUrl == null) localBaseUrl = "https://dapi.kakao.com";
        if (mobilityBaseUrl == null) mobilityBaseUrl = "https://apis-navi.kakaomobility.com";
        if (timeoutMillis <= 0) timeoutMillis = 3000;
    }
    @Override public String toString() { return "KakaoProperties[mode=" + mode + "]"; }
}
