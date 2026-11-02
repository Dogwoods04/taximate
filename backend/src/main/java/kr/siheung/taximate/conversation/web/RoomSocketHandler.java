package kr.siheung.taximate.conversation.web;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import kr.siheung.taximate.common.error.ApiException;
import kr.siheung.taximate.rideroom.application.RoomService;
import kr.siheung.taximate.conversation.application.SocketEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.*;
@Component
public class RoomSocketHandler extends TextWebSocketHandler {
    private final Set<WebSocketSession> sessions=ConcurrentHashMap.newKeySet();
    private final ObjectMapper mapper;
    private final RoomService rooms;
    public RoomSocketHandler(ObjectMapper mapper,RoomService rooms) { this.mapper=mapper; this.rooms=rooms; }
    @Override public void afterConnectionEstablished(WebSocketSession session) { sessions.add(new ConcurrentWebSocketSessionDecorator(session,10000,65536)); }
    @Override public void afterConnectionClosed(WebSocketSession session,CloseStatus status) { sessions.removeIf(s->s.getId().equals(session.getId())); }
    @Override protected void handleTextMessage(WebSocketSession session,TextMessage message) throws IOException { session.close(CloseStatus.POLICY_VIOLATION.withReason("Server push only")); }
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void publish(SocketEvent event) {
        for(WebSocketSession s:sessions) {
            if(!event.roomId().equals(s.getAttributes().get("roomId"))) continue;
            try {
                rooms.requireActiveParticipant(event.roomId(),(UUID)s.getAttributes().get("memberId"));
                if(s.isOpen()) s.sendMessage(new TextMessage(mapper.writeValueAsString(Map.of("type",event.type(),"payload",event.payload()))));
                else sessions.remove(s);
            } catch(ApiException | IOException | IllegalStateException ex) {
                sessions.remove(s); try { s.close(CloseStatus.POLICY_VIOLATION); } catch(IOException ignored) {}
            }
        }
    }
}
