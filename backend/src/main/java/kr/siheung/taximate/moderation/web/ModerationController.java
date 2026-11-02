package kr.siheung.taximate.moderation.web;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.moderation.application.ModerationService;
import kr.siheung.taximate.moderation.domain.*;
import org.springframework.web.bind.annotation.*;
@RestController
public class ModerationController {
    private final ModerationService service;
    public ModerationController(ModerationService service) { this.service=service; }
    public record Create(@NotNull Report.TargetType targetType,@NotNull UUID targetId,@NotNull Report.Reason reason,@Size(max=500) String detail) {}
    public record Action(@NotNull ModerationAction.Action action,@Size(max=1000) String note) {}
    @PostMapping("/api/reports") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Object create(@CurrentMember AuthenticatedMember me,@Valid @RequestBody Create r) { return service.report(me.memberId(),r.targetType(),r.targetId(),r.reason(),r.detail()); }
    @GetMapping("/api/admin/reports") public Object list(@CurrentMember AuthenticatedMember me,@RequestParam(defaultValue="OPEN") Report.Status status) { return service.list(me,status); }
    @PostMapping("/api/admin/reports/{id}/actions") public Object act(@CurrentMember AuthenticatedMember me,@PathVariable UUID id,@Valid @RequestBody Action r) { return service.act(me,id,r.action(),r.note()); }
    @GetMapping("/api/admin/metrics") public Object metrics(@CurrentMember AuthenticatedMember me) { return service.metrics(me); }
}
