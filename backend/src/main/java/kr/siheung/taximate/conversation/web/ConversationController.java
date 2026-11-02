package kr.siheung.taximate.conversation.web;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.conversation.application.ConversationService;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/rooms/{id}/messages")
public class ConversationController {
    private final ConversationService service;
    public ConversationController(ConversationService service) { this.service=service; }
    public record Send(@NotBlank String body,@NotBlank @Size(max=100) String clientMessageId) {}
    @GetMapping public Object list(@CurrentMember AuthenticatedMember me,@PathVariable UUID id,@RequestParam(required=false) UUID after,@RequestParam(defaultValue="50") int limit) { return service.list(id,me.memberId(),after,limit); }
    @PostMapping @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Object send(@CurrentMember AuthenticatedMember me,@PathVariable UUID id,@Valid @RequestBody Send r) { return service.send(id,me.memberId(),r.body(),r.clientMessageId()); }
}
