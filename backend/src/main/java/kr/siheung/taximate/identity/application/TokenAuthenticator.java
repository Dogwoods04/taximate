package kr.siheung.taximate.identity.application;
import kr.siheung.taximate.common.auth.AuthenticatedMember;
public interface TokenAuthenticator {
    AuthenticatedMember authenticate(String token);
}
