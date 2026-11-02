package kr.siheung.taximate.conversation.application;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.identity.api.IdentityApi;
import kr.siheung.taximate.rideroom.application.*;
import kr.siheung.taximate.conversation.domain.Message;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service @Transactional
public class ConversationService {
    @PersistenceContext private EntityManager em;
    private final RoomService rooms;
    private final IdentityApi identity;
    private final ConversationProperties props;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    public ConversationService(RoomService rooms,IdentityApi identity,ConversationProperties props,Clock clock,ApplicationEventPublisher events) {
        this.rooms=rooms; this.identity=identity; this.props=props; this.clock=clock; this.events=events;
    }
    public record MessageDto(UUID id,UUID roomId,UUID senderId,String senderNickname,Message.Type type,String body,boolean hidden,OffsetDateTime createdAt) {}
    private Message message(UUID id) { Message m=em.find(Message.class,id); if(m==null) throw ApiException.notFound("Message"); return m; }
    private MessageDto dto(Message m) { return new MessageDto(m.id,m.roomId,m.senderId,m.senderId==null?null:identity.getMember(m.senderId).nickname(),m.type,m.hidden?null:m.body,m.hidden,m.createdAt); }
    public List<MessageDto> list(UUID roomId,UUID memberId,UUID after,int limit) {
        rooms.requireActiveParticipant(roomId,memberId);
        if(limit<1 || limit>100) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Limit must be 1 to 100");
        Message cursor=after==null?null:message(after);
        if(cursor!=null && !cursor.roomId.equals(roomId)) throw ApiException.notFound("Message cursor");
        var q=em.createQuery("from Message where roomId=:room"+(cursor==null?"":" and (createdAt>:created or (createdAt=:created and id>:id))")+" order by createdAt,id",Message.class).setParameter("room",roomId).setMaxResults(limit);
        if(cursor!=null) q.setParameter("created",cursor.createdAt).setParameter("id",cursor.id);
        return q.getResultList().stream().map(this::dto).toList();
    }
    public MessageDto send(UUID roomId,UUID memberId,String body,String clientMessageId) {
        rooms.requireWritable(roomId,memberId);
        if(body==null || body.isBlank() || body.length()>props.messageMaxLength() || clientMessageId==null || clientMessageId.isBlank() || clientMessageId.length()>100)
            throw new ApiException(ErrorCode.VALIDATION_FAILED,"Invalid message");
        Message old=em.createQuery("from Message where roomId=:room and senderId=:sender and clientMessageId=:client",Message.class)
            .setParameter("room",roomId).setParameter("sender",memberId).setParameter("client",clientMessageId).getResultStream().findFirst().orElse(null);
        if(old!=null) return dto(old);
        return save(roomId,memberId,Message.Type.TEXT,body,clientMessageId);
    }
    private MessageDto save(UUID roomId,UUID sender,Message.Type type,String body,String client) {
        Message m=new Message(); m.id=UUID.randomUUID(); m.roomId=roomId; m.senderId=sender; m.type=type; m.body=body; m.clientMessageId=client; m.createdAt=OffsetDateTime.now(clock); em.persist(m);
        MessageDto result=dto(m); events.publishEvent(new SocketEvent(roomId,"MESSAGE_CREATED",result)); return result;
    }
    @EventListener public void changed(RoomChangedEvent e) {
        if(e.systemMessage()!=null) save(e.roomId(),null,Message.Type.SYSTEM,e.systemMessage(),null);
        events.publishEvent(new SocketEvent(e.roomId(),"ROOM_UPDATED",Map.of("roomId",e.roomId(),"status",e.status(),"termsVersion",e.termsVersion())));
    }
    public record MessageTarget(UUID senderId,String preview) {}
    public MessageTarget target(UUID id) { Message m=message(id); return new MessageTarget(m.senderId,m.body.substring(0,Math.min(80,m.body.length()))); }
    public void requireVisibleTarget(UUID id,UUID requester) { rooms.requireActiveParticipant(message(id).roomId,requester); }
    public void hide(UUID id) { Message m=message(id); m.hidden=true; events.publishEvent(new SocketEvent(m.roomId,"MESSAGE_HIDDEN",Map.of("messageId",id))); }
    @Scheduled(cron="0 0 4 * * *",zone="Asia/Seoul") public void retain() {
        List<UUID> ids=rooms.endedBefore(OffsetDateTime.now(clock).minusDays(props.retentionDays()));
        if(!ids.isEmpty()) em.createQuery("delete from Message where roomId in :ids").setParameter("ids",ids).executeUpdate();
    }
}
