package kr.siheung.taximate.identity.web;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import kr.siheung.taximate.common.auth.*;
import kr.siheung.taximate.identity.application.IdentityService;
import org.springframework.web.bind.annotation.*;
@RestController
public class IdentityController {
    private final IdentityService service;
    public IdentityController(IdentityService service) { this.service=service; }
    public record LoginRequest(@NotBlank @Size(min=2,max=20) String nickname) {}
    public record ConsentRequest(@NotBlank @Size(max=100) String policyVersion) {}
    @PostMapping("/api/auth/dev-login") public Object login(@Valid @RequestBody LoginRequest r) { return service.login(r.nickname()); }
    @GetMapping("/api/me") public Object me(@CurrentMember AuthenticatedMember me) { return service.me(me.memberId()); }
    @PostMapping("/api/me/consents/location") public Object agree(@CurrentMember AuthenticatedMember me,@Valid @RequestBody ConsentRequest r) { return service.agree(me.memberId(),r.policyVersion()); }
    @DeleteMapping("/api/me/consents/location") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void withdraw(@CurrentMember AuthenticatedMember me) { service.withdraw(me.memberId()); }
}
