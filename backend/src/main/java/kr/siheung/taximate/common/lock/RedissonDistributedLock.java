package kr.siheung.taximate.common.lock;

import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import kr.siheung.taximate.common.error.ApiException;
import kr.siheung.taximate.common.error.ErrorCode;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

public class RedissonDistributedLock implements DistributedLock {
    private static final String PREFIX = "taximate:lock:";
    private final RedissonClient redisson;
    private final long waitMillis;
    private final long leaseMillis;

    public RedissonDistributedLock(RedissonClient redisson, long waitMillis, long leaseMillis) {
        this.redisson = redisson;
        this.waitMillis = waitMillis;
        this.leaseMillis = leaseMillis;
    }

    @Override
    public <T> T withLock(String key, Supplier<T> work) {
        RLock lock = redisson.getLock(PREFIX + key);
        boolean acquired;
        try {
            acquired = lock.tryLock(waitMillis, leaseMillis, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(ErrorCode.LOCK_TIMEOUT, "Interrupted while waiting for lock");
        }
        if (!acquired) {
            throw new ApiException(ErrorCode.LOCK_TIMEOUT, "Busy, please retry");
        }
        try {
            return work.get();
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}
