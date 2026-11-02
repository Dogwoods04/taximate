package kr.siheung.taximate.common.lock;

import java.util.function.Supplier;

/**
 * Serializes work on a key (e.g. "room:{id}") across app instances.
 * The lock only reduces contention: callers MUST still re-validate state inside a DB
 * transaction (row lock / @Version). Call this OUTSIDE the @Transactional boundary so the
 * transaction commits before the lock is released.
 * Throws ApiException(LOCK_TIMEOUT) when the lock cannot be acquired within wait-millis.
 */
public interface DistributedLock {
    <T> T withLock(String key, Supplier<T> work);
}
