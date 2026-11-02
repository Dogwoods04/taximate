package kr.siheung.taximate.conversation.web;
import java.util.*;
import kr.siheung.taximate.common.error.ApiException;
import kr.siheung.taximate.common.web.CorsConfig.CorsProperties;
import kr.siheung.taximate.identity.application.TokenAuthenticator;
import kr.siheung.taximate.rideroom.application.RoomService;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.*;
import org.springframework.http.server.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;
@Configuration @EnableWebSocket
public class RoomSocketConfig implements WebSocketConfigurer {
    private final RoomSocketHandler handler;
    private final TokenAuthenticator auth;
    private final RoomService rooms;
    private final CorsProperties cors;
    public RoomSocketConfig(RoomSocketHandler handler,TokenAuthenticator auth,RoomService rooms,CorsProperties cors) { this.handler=handler; this.auth=auth; this.rooms=rooms; this.cors=cors; }
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler,"/ws/rooms/*").setAllowedOrigins(cors.allowedOrigins().toArray(String[]::new)).addInterceptors(new HandshakeInterceptor() {
            public boolean beforeHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Map<String,Object> attributes) {
                try {
                    String token=UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("token");
                    var me=auth.authenticate(token); String path=request.getURI().getPath(); UUID roomId=UUID.fromString(path.substring(path.lastIndexOf('/')+1));
                    rooms.requireActiveParticipant(roomId,me.memberId()); attributes.put("roomId",roomId); attributes.put("memberId",me.memberId()); return true;
                } catch(ApiException e) { response.setStatusCode(e.code().status()); return false; }
                catch(IllegalArgumentException e) { response.setStatusCode(HttpStatus.BAD_REQUEST); return false; }
            }
            public void afterHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Exception exception) {}
        });
    }
}
