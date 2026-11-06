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
    public record ServicesConsentDto(UUID id, String policyVersion, List<String> items, OffsetDateTime agreedAt) {}
    public record MemberDto(UUID id, String nickname, MemberRole role, MemberStatus status, ConsentDto locationConsent, ServicesConsentDto servicesConsent, Gender gender, GenderSource genderSource, String authProvider) {}
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
    private ServiceConsent servicesConsent(UUID id) {
        return em.createQuery("from ServiceConsent where memberId=:id and withdrawnAt is null",ServiceConsent.class)
            .setParameter("id",id).getResultStream().findFirst().orElse(null);
    }
    private static ServicesConsentDto toDto(ServiceConsent c) {
        return c==null?null:new ServicesConsentDto(c.id,c.policyVersion,List.of(c.items.split(",")),c.agreedAt);
    }
    public MemberDto me(UUID id) {
        Member m=member(id); LocationConsent c=consent(id);
        return new MemberDto(m.id,m.nickname,m.role,m.status,c==null?null:new ConsentDto(c.id,c.policyVersion,c.agreedAt),toDto(servicesConsent(id)),m.gender,m.genderSource,m.authProvider);
    }
    @Override public Gender getGender(UUID id) { return member(id).gender; }
    public MemberDto setGender(UUID id,Gender gender) {
        Member m=em.find(Member.class,id,LockModeType.PESSIMISTIC_WRITE); requireActive(id);
        if(m.genderSource==GenderSource.KAKAO) throw new ApiException(ErrorCode.GENDER_SOURCE_LOCKED,"Kakao gender cannot be changed manually");
        m.gender=Objects.requireNonNull(gender); m.genderSource=GenderSource.SELF; m.genderUpdatedAt=OffsetDateTime.now(clock);
        return me(id);
    }
    public LoginDto login(String nickname) {
        if(!props.devLoginEnabled()) throw ApiException.forbidden("Development login disabled");
        nickname=nickname.trim();
        if(nickname.length()<2 || nickname.length()>20) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Invalid nickname");
        lockNames();
        // Database advisory lock also serializes first login before a member row exists.
        // pg_advisory_xact_lock returns void; wrap it so the JDBC result is a plain integer.
        em.createNativeQuery("select 1 from (select pg_advisory_xact_lock(hashtextextended(:nickname, 0))) l").setParameter("nickname",nickname).getSingleResult();
        Member m=em.createQuery("from Member where nickname=:nickname",Member.class).setParameter("nickname",nickname).getResultStream().findFirst().orElse(null);
        if(m==null) {
            m=new Member(); m.id=UUID.randomUUID(); m.nickname=nickname; m.status=MemberStatus.ACTIVE;
            m.createdAt=OffsetDateTime.now(clock); m.role=MemberRole.USER; em.persist(m);
        }
        if (!"DEV".equals(m.authProvider)) throw new ApiException(ErrorCode.NICKNAME_TAKEN,"Use Kakao login for this account");
        m.role=Arrays.stream(props.adminNicknames().split(",")).map(String::trim).anyMatch(nickname::equals)?MemberRole.ADMIN:MemberRole.USER;
        return issueToken(m);
    }
    private LoginDto issueToken(Member m) {
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        AuthToken t=new AuthToken(); t.token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        t.memberId=m.id; t.createdAt=t.lastUsedAt=OffsetDateTime.now(clock); em.persist(t);
        return new LoginDto(t.token,me(m.id));
    }
    // A single DB transaction lock covers all nickname writers, including first logins and renames.
    private void lockNames() { em.createNativeQuery("select 1 from (select pg_advisory_xact_lock(871302014)) l").getSingleResult(); }
    private boolean reserved(String name) { return Arrays.stream(props.adminNicknames().split(",")).map(String::trim).anyMatch(name::equals); }
    private boolean taken(String name) { return em.createQuery("select count(m) from Member m where nickname=:name",Long.class).setParameter("name",name).getSingleResult()>0; }
    public MemberDto rename(UUID id,String nickname) {
        nickname=nickname.trim();
        if(nickname.length()<2 || nickname.length()>20) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Invalid nickname");
        lockNames(); Member m=member(id); requireActive(id);
        if(reserved(nickname) || (!m.nickname.equals(nickname) && taken(nickname))) throw new ApiException(ErrorCode.NICKNAME_TAKEN,"Nickname unavailable");
        m.nickname=nickname; return me(id);
    }
    public record KakaoLoginDto(String token, MemberDto member, boolean isNew, String suggestedNickname) {}
    public KakaoLoginDto kakaoLogin(KakaoClient.Profile profile) {
        lockNames();
        Member m=em.createQuery("from Member where kakaoId=:id",Member.class).setParameter("id",profile.id()).getResultStream().findFirst().orElse(null);
        boolean isNew=m==null;
        if(isNew) {
            String base=profile.nickname().trim();
            if(base.length()>20) base=base.substring(0,20);
            if(base.length()<2) base="이웃"+(1000+random.nextInt(9000));
            String name=base;
            for(int n=1; reserved(name)||taken(name); n++) { String suffix=Integer.toString(n); name=base.substring(0,Math.min(base.length(),20-suffix.length()))+suffix; }
            m=new Member(); m.id=UUID.randomUUID(); m.nickname=name; m.kakaoId=profile.id(); m.authProvider="KAKAO";
            m.status=MemberStatus.ACTIVE; m.role=MemberRole.USER; m.createdAt=OffsetDateTime.now(clock); em.persist(m);
        }
        if(profile.gender()!=null) { m.gender=profile.gender(); m.genderSource=GenderSource.KAKAO; m.genderUpdatedAt=OffsetDateTime.now(clock); }
        LoginDto login=issueToken(m);
        return new KakaoLoginDto(login.token(),login.member(),isNew,m.nickname);
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
    public ServicesConsentDto agreeServices(UUID id,String version,List<String> items) {
        if(version==null || version.isBlank() || version.length()>32) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Invalid policyVersion");
        EnumSet<ServiceItem> set=EnumSet.noneOf(ServiceItem.class);
        if(items!=null) for(String i:items) {
            try { set.add(ServiceItem.valueOf(i)); }
            catch(IllegalArgumentException|NullPointerException e) { throw new ApiException(ErrorCode.VALIDATION_FAILED,"Unknown service item: "+i); }
        }
        if(!set.containsAll(EnumSet.allOf(ServiceItem.class))) throw new ApiException(ErrorCode.VALIDATION_FAILED,"All service items are required: "+EnumSet.allOf(ServiceItem.class));
        // Same serialization as location consent: lock the member row.
        em.find(Member.class,id,LockModeType.PESSIMISTIC_WRITE); requireActive(id);
        OffsetDateTime now=OffsetDateTime.now(clock);
        ServiceConsent c=servicesConsent(id);
        if(c!=null) { c.withdrawnAt=now; em.flush(); }
        c=new ServiceConsent(); c.id=UUID.randomUUID(); c.memberId=id; c.policyVersion=version;
        c.items=String.join(",",set.stream().map(Enum::name).toList()); c.agreedAt=now; em.persist(c);
        return toDto(c);
    }
    public void withdrawServices(UUID id) {
        em.find(Member.class,id,LockModeType.PESSIMISTIC_WRITE);
        ServiceConsent c=servicesConsent(id);
        if(c!=null) c.withdrawnAt=OffsetDateTime.now(clock);
    }
}
