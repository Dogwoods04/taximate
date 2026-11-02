package kr.siheung.taximate.common.web;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {
    private final CorsProperties props;

    public CorsConfig(CorsProperties props) {
        this.props = props;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(props.allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }

    @ConfigurationProperties(prefix = "taximate.cors")
    public record CorsProperties(List<String> allowedOrigins) {
        public CorsProperties {
            if (allowedOrigins == null) allowedOrigins = List.of("http://localhost:5173");
        }
    }
}
