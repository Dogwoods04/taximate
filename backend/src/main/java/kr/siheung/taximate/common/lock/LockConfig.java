package kr.siheung.taximate.common.lock;

import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class LockConfig {

    @Bean(destroyMethod = "shutdown")
    @ConditionalOnProperty(prefix = "taximate.lock", name = "mode", havingValue = "redis")
    public RedissonClient redissonClient(LockProperties props) {
        Config config = new Config();
        config.useSingleServer().setAddress(props.redisUrl());
        return Redisson.create(config);
    }

    @Bean
    @ConditionalOnProperty(prefix = "taximate.lock", name = "mode", havingValue = "redis")
    public DistributedLock redissonDistributedLock(RedissonClient client, LockProperties props) {
        return new RedissonDistributedLock(client, props.waitMillis(), props.leaseMillis());
    }

    @Bean
    @ConditionalOnProperty(prefix = "taximate.lock", name = "mode", havingValue = "local", matchIfMissing = true)
    public DistributedLock localDistributedLock(LockProperties props) {
        return new LocalDistributedLock(props.waitMillis());
    }
}
