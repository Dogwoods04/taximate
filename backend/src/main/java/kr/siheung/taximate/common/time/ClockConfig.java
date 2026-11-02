package kr.siheung.taximate.common.time;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {
    public static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    /** Inject this instead of calling now() directly. */
    @Bean
    public Clock clock() {
        return Clock.system(SEOUL);
    }
}
