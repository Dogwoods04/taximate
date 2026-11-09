package kr.siheung.taximate.moderation.application;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import kr.siheung.taximate.common.auth.AuthenticatedMember;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.identity.api.IdentityApi;
import kr.siheung.taximate.trip.api.TripApi;
import kr.siheung.taximate.rideroom.application.RoomService;
import kr.siheung.taximate.conversation.application.ConversationService;
import kr.siheung.taximate.moderation.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service @Transactional
public class ModerationService {
    @PersistenceContext private EntityManager em;
    private final IdentityApi identity;
    private final TripApi trips;
    private final RoomService rooms;
    private final ConversationService conversation;
    private final Clock clock;
    public ModerationService(IdentityApi identity,TripApi trips,RoomService rooms,ConversationService conversation,Clock clock) {
        this.identity=identity; this.trips=trips; this.rooms=rooms; this.conversation=conversation; this.clock=clock;
    }
    public record ReportDto(UUID id,UUID reporterId,String reporterNickname,Report.TargetType targetType,UUID targetId,Report.Reason reason,String detail,Report.Status status,String targetPreview,OffsetDateTime createdAt,OffsetDateTime resolvedAt,String resolutionNote) {}
    private ReportDto dto(Report r) { return new ReportDto(r.id,r.reporterId,identity.getMember(r.reporterId).nickname(),r.targetType,r.targetId,r.reason,r.detail,r.status,r.targetPreview,r.createdAt,r.resolvedAt,r.resolutionNote); }
    private void admin(AuthenticatedMember me) { if(!me.isAdmin()) throw ApiException.forbidden("Admin required"); }
    public ReportDto report(UUID memberId,Report.TargetType type,UUID targetId,Report.Reason reason,String detail) {
        String preview=switch(type) {
            case ROOM -> { var r=rooms.summary(targetId); yield r.originLabel()+" → "+r.destinationLabel(); }
            case MESSAGE -> { conversation.requireVisibleTarget(targetId,memberId); yield conversation.target(targetId).preview(); }
            case MEMBER -> identity.getMember(targetId).nickname();
        };
        Report r=new Report(); r.id=UUID.randomUUID(); r.reporterId=memberId; r.targetType=type; r.targetId=targetId; r.reason=reason; r.detail=detail; r.status=Report.Status.OPEN; r.targetPreview=preview; r.createdAt=OffsetDateTime.now(clock); em.persist(r); return dto(r);
    }
    public List<ReportDto> list(AuthenticatedMember me,Report.Status status) { admin(me); return em.createQuery("from Report where status=:status order by createdAt desc",Report.class).setParameter("status",status).getResultList().stream().map(this::dto).toList(); }
    public ReportDto act(AuthenticatedMember me,UUID id,ModerationAction.Action action,String note) {
        admin(me); Report r=em.find(Report.class,id,LockModeType.PESSIMISTIC_WRITE); if(r==null) throw ApiException.notFound("Report");
        if(r.status!=Report.Status.OPEN) return dto(r);
        switch(action) {
            case HIDE_ROOM -> { requireType(r,Report.TargetType.ROOM); rooms.hide(r.targetId); }
            case HIDE_MESSAGE -> { requireType(r,Report.TargetType.MESSAGE); conversation.hide(r.targetId); }
            case RESTRICT_MEMBER -> { requireType(r,Report.TargetType.MEMBER); identity.restrictMember(r.targetId,note); }
            case DISMISS -> {}
        }
        r.status=action==ModerationAction.Action.DISMISS?Report.Status.DISMISSED:Report.Status.RESOLVED;
        r.resolvedAt=OffsetDateTime.now(clock); r.resolvedBy=me.memberId(); r.resolutionNote=note;
        ModerationAction a=new ModerationAction(); a.id=UUID.randomUUID(); a.reportId=id; a.adminId=me.memberId(); a.action=action; a.note=note; a.createdAt=r.resolvedAt; em.persist(a); return dto(r);
    }
    /**
     * 회원 탈퇴: report rows are kept (ids, type, reason, status, admin resolution) but nothing personal about the
     * withdrawn member remains: previews of reports about them (their nickname, message text, hosted-room area
     * labels) and the free-text detail they wrote as reporter are cleared. Nicknames are resolved live through
     * IdentityApi, so the reporter now shows as the withdrawn placeholder.
     */
    @org.springframework.context.event.EventListener @org.springframework.core.annotation.Order(40)
    public void memberWithdrawn(kr.siheung.taximate.identity.api.MemberWithdrawnEvent e) {
        UUID member=e.memberId();
        em.createQuery("update Report r set r.detail=null where r.reporterId=:member").setParameter("member",member).executeUpdate();
        em.createQuery("update Report r set r.targetPreview=null where r.targetType=:type and r.targetId=:member")
            .setParameter("type",Report.TargetType.MEMBER).setParameter("member",member).executeUpdate();
        scrubPreviews(Report.TargetType.MESSAGE,conversation.messageIdsBySender(member));
        scrubPreviews(Report.TargetType.ROOM,rooms.hostedRoomIds(member));
    }
    private void scrubPreviews(Report.TargetType type,List<UUID> ids) {
        if(ids.isEmpty()) return;
        em.createQuery("update Report r set r.targetPreview=null where r.targetType=:type and r.targetId in :ids")
            .setParameter("type",type).setParameter("ids",ids).executeUpdate();
    }
    private void requireType(Report r,Report.TargetType type) { if(r.targetType!=type) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Action does not match report target"); }
    public record AdminMetrics(int periodDays,long openReports,long reportsInPeriod,long tripsCreated,long tripsMatched,long tripsNoMatch,long tripsExpired,double matchFailureRate,long roomsCreated,long roomsConfirmed) {}
    public AdminMetrics metrics(AuthenticatedMember me) {
        admin(me); OffsetDateTime since=OffsetDateTime.now(clock).minusDays(7); var t=trips.statsSince(since); var r=rooms.statsSince(since);
        long open=em.createQuery("select count(r) from Report r where r.status=:status",Long.class).setParameter("status",Report.Status.OPEN).getSingleResult();
        long period=em.createQuery("select count(r) from Report r where r.createdAt>=:since",Long.class).setParameter("since",since).getSingleResult();
        return new AdminMetrics(7,open,period,t.created(),t.matched(),t.noMatch(),t.expired(),t.created()==0?0:(double)(t.noMatch()+t.expired())/t.created(),r.created(),r.confirmed());
    }
}
