package kr.siheung.taximate.identity.application;

import jakarta.persistence.*;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.identity.api.*;
import kr.siheung.taximate.identity.domain.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Transactional
public class IdentityService implements IdentityApi, TokenAuthenticator {
    @PersistenceContext private EntityManager em;
    private final Clock clock;
    private final AuthProperties props;
    private final ApplicationEventPublisher events;
    private final SecureRandom random = new SecureRandom();
    public IdentityService(Clock clock, AuthProperties props, ApplicationEventPublisher events) {
        this.clock=clock; this.props=props; this.events=events;
    }
    public record ConsentDto(UUID id, String policyVersion, OffsetDateTime agreedAt) {}
    public record MemberDto(UUID id, String nickname, MemberRole role, MemberStatus status, ConsentDto locationConsent) {}
    public record LoginDto(String token, MemberDto member) {}
    private Member member(UUID id) {
        Member m=em.find(Member.class,id);
        if(m==null) throw ApiException.notFound("Member");
        return m;
    }
    private LocationConsent consent(UUID id) {
        return em.createQuery("from LocationConsent where memberId=:id and withdrawnAt is null",LocationConsent.class)
            .setParameter("id",id).getResultStream().findFirst().orElse(null);
    }
    public MemberDto me(UUID id) {
        Member m=member(id); LocationConsent c=consent(id);
        return new MemberDto(m.id,m.nickname,m.role,m.status,c==null?null:new ConsentDto(c.id,c.policyVersion,c.agreedAt));
    }
    public LoginDto login(String nickname) {
        if(!props.devLoginEnabled()) throw ApiException.forbidden("Development login disabled");
        nickname=nickname.trim();
        if(nickname.length()<2 || nickname.length()>20) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Invalid nickname");
        // Database advisory lock also serializes first login before a member row exists.
        // pg_advisory_xact_lock returns void; wrap it so the JDBC result is a plain integer.
        em.createNativeQuery("select 1 from (select pg_advisory_xact_lock(hashtextextended(:nickname, 0))) l").setParameter("nickname",nickname).getSingleResult();
        Member m=em.createQuery("from Member where nickname=:nickname",Member.class).setParameter("nickname",nickname).getResultStream().findFirst().orElse(null);
        if(m==null) {
            m=new Member(); m.id=UUID.randomUUID(); m.nickname=nickname; m.status=MemberStatus.ACTIVE;
            m.createdAt=OffsetDateTime.now(clock); m.role=MemberRole.USER; em.persist(m);
        }
        m.role=Arrays.stream(props.adminNicknames().split(",")).map(String::trim).anyMatch(nickname::equals)?MemberRole.ADMIN:MemberRole.USER;
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        AuthToken t=new AuthToken(); t.token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        t.memberId=m.id; t.createdAt=t.lastUsedAt=OffsetDateTime.now(clock); em.persist(t);
        return new LoginDto(t.token,me(m.id));
    }
    @Override public AuthenticatedMember authenticate(String token) {
        AuthToken t=token==null?null:em.find(AuthToken.class,token);
        if(t==null) throw new ApiException(ErrorCode.UNAUTHENTICATED,"Authentication required");
        Member m=member(t.memberId); t.lastUsedAt=OffsetDateTime.now(clock);
        return new AuthenticatedMember(m.id,m.nickname,m.role);
    }
    @Override public MemberSnapshot getMember(UUID id) { Member m=member(id); return new MemberSnapshot(m.id,m.nickname,m.role,m.status); }
    @Override public Map<UUID,MemberSnapshot> getMembers(Collection<UUID> ids) {
        Map<UUID,MemberSnapshot> out=new HashMap<>();
        if(!ids.isEmpty()) for(Member m:em.createQuery("from Member where id in :ids",Member.class).setParameter("ids",ids).getResultList())
            out.put(m.id,new MemberSnapshot(m.id,m.nickname,m.role,m.status));
        return out;
    }
    @Override public void requireActive(UUID id) {
        if(member(id).status!=MemberStatus.ACTIVE) throw new ApiException(ErrorCode.MEMBER_RESTRICTED,"Member restricted");
    }
    @Override public UUID requireLocationConsent(UUID id) {
        requireActive(id); LocationConsent c=consent(id);
        if(c==null) throw new ApiException(ErrorCode.LOCATION_CONSENT_REQUIRED,"Location consent required");
        return c.id;
    }
    @Override public void restrictMember(UUID id,String reason) { Member m=member(id); m.status=MemberStatus.RESTRICTED; m.restrictedReason=reason; }
    public ConsentDto agree(UUID id,String version) {
        em.find(Member.class,id,LockModeType.PESSIMISTIC_WRITE); requireActive(id);
        LocationConsent c=consent(id);
        if(c!=null && c.policyVersion.equals(version)) return new ConsentDto(c.id,c.policyVersion,c.agreedAt);
        if(c!=null) { c.withdrawnAt=OffsetDateTime.now(clock); em.flush(); }
        c=new LocationConsent(); c.id=UUID.randomUUID(); c.memberId=id; c.policyVersion=version; c.agreedAt=OffsetDateTime.now(clock); em.persist(c);
        return new ConsentDto(c.id,c.policyVersion,c.agreedAt);
    }
    public void withdraw(UUID id) {
        em.find(Member.class,id,LockModeType.PESSIMISTIC_WRITE);
        LocationConsent c=consent(id);
        if(c!=null) { c.withdrawnAt=OffsetDateTime.now(clock); events.publishEvent(new LocationConsentWithdrawnEvent(id)); }
    }
}
