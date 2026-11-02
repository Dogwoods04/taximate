package kr.siheung.taximate.conversation.application;
import java.util.UUID;
public record SocketEvent(UUID roomId,String type,Object payload) {}
