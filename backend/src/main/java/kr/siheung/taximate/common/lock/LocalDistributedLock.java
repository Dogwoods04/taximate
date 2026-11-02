package kr.siheung.taximate.common.lock;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import kr.siheung.taximate.common.error.ApiException;
import kr.siheung.taximate.common.error.ErrorCode;

/** In-JVM fallback for local development without Redis. Not safe for multiple instances. */
public class LocalDistributedLock implements DistributedLock {
    private final ConcurrentHashMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();
    private final long waitMillis;

    public LocalDistributedLock(long waitMillis) {
        this.waitMillis = waitMillis;
    }

    @Override
    public <T> T withLock(String key, Supplier<T> work) {
        ReentrantLock lock = locks.computeIfAbsent(key, k -> new ReentrantLock(true));
        boolean acquired;
        try {
            acquired = lock.tryLock(waitMillis, TimeUnit.MILLISECONDS);
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
            lock.unlock();
        }
    }
}
