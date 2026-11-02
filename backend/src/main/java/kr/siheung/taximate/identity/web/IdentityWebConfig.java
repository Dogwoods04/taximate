package kr.siheung.taximate.identity.web;
import java.util.List;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.identity.application.TokenAuthenticator;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.*;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
@Configuration
public class IdentityWebConfig implements WebMvcConfigurer {
    private final TokenAuthenticator auth;
    public IdentityWebConfig(TokenAuthenticator auth) { this.auth=auth; }
    @Override public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new HandlerMethodArgumentResolver() {
            public boolean supportsParameter(MethodParameter p) { return p.hasParameterAnnotation(CurrentMember.class) && p.getParameterType()==AuthenticatedMember.class; }
            public Object resolveArgument(MethodParameter p,ModelAndViewContainer c,NativeWebRequest r,WebDataBinderFactory b) {
                String h=r.getHeader("Authorization");
                return auth.authenticate(h!=null && h.startsWith("Bearer ")?h.substring(7):null);
            }
        });
    }
}
