package kr.siheung.taximate.common.lock;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "taximate.lock")
public record LockProperties(String mode, String redisUrl, long waitMillis, long leaseMillis) {
    public LockProperties {
        if (mode == null) mode = "local";
        if (redisUrl == null) redisUrl = "redis://localhost:6379";
        if (waitMillis <= 0) waitMillis = 3000;
        if (leaseMillis <= 0) leaseMillis = 10000;
    }
}
