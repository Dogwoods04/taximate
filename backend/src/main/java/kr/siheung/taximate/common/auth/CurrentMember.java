package kr.siheung.taximate.common.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Controller parameter annotation. Resolves to {@link AuthenticatedMember}.
 * Missing/invalid token -> 401 UNAUTHENTICATED. Implemented by identity module's argument resolver.
 * Usage: {@code public X get(@CurrentMember AuthenticatedMember me)}
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentMember {
}
