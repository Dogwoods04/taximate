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
    public record GenderRequest(@NotNull kr.siheung.taximate.identity.api.Gender gender) {}
    @PutMapping("/api/me/gender") public Object gender(@CurrentMember AuthenticatedMember me,@Valid @RequestBody GenderRequest r) { return service.setGender(me.memberId(),r.gender()); }
    public record LoginRequest(@NotBlank @Size(min=2,max=20) String nickname) {}
    public record ConsentRequest(@NotBlank @Size(max=100) String policyVersion) {}
    public record ServicesConsentRequest(@NotBlank @Size(max=32) String policyVersion, @NotNull java.util.List<String> items) {}
    @PostMapping("/api/auth/dev-login") public Object login(@Valid @RequestBody LoginRequest r) { return service.login(r.nickname()); }
    @GetMapping("/api/me") public Object me(@CurrentMember AuthenticatedMember me) { return service.me(me.memberId()); }
    @PostMapping("/api/me/consents/location") public Object agree(@CurrentMember AuthenticatedMember me,@Valid @RequestBody ConsentRequest r) { return service.agree(me.memberId(),r.policyVersion()); }
    @DeleteMapping("/api/me/consents/location") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void withdraw(@CurrentMember AuthenticatedMember me) { service.withdraw(me.memberId()); }
    @PostMapping("/api/me/consents/services") public Object agreeServices(@CurrentMember AuthenticatedMember me,@Valid @RequestBody ServicesConsentRequest r) { return service.agreeServices(me.memberId(),r.policyVersion(),r.items()); }
    @DeleteMapping("/api/me/consents/services") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void withdrawServices(@CurrentMember AuthenticatedMember me) { service.withdrawServices(me.memberId()); }
}
