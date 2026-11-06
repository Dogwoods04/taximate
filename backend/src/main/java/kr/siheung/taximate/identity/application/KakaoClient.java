package kr.siheung.taximate.identity.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.stream.Collectors;
import kr.siheung.taximate.common.error.*;
import kr.siheung.taximate.identity.api.Gender;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class KakaoClient {
    private final KakaoProperties props;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    public KakaoClient(KakaoProperties props, ObjectMapper json) { this.props=props; this.json=json; }
    public record Profile(long id, String nickname, Gender gender) {}
    public Profile exchange(String code, String redirectUri) {
        if (!props.allowedRedirectUris().contains(redirectUri)) throw new ApiException(ErrorCode.VALIDATION_FAILED,"Redirect URI not allowed");
        if (!props.available()) throw ApiException.forbidden("Kakao login disabled");
        var form = new LinkedHashMap<String,String>();
        form.put("grant_type","authorization_code"); form.put("client_id",props.restApiKey());
        form.put("redirect_uri",redirectUri); form.put("code",code);
        if (!props.clientSecret().isBlank()) form.put("client_secret",props.clientSecret());
        String body=form.entrySet().stream().map(e -> encode(e.getKey())+"="+encode(e.getValue())).collect(Collectors.joining("&"));
        try {
            var response=http.send(HttpRequest.newBuilder(URI.create(props.authBaseUrl()+"/oauth/token"))
                .timeout(Duration.ofSeconds(5)).header("Content-Type","application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                boolean invalid=false;
                if(response.statusCode()==400 || response.statusCode()==401) {
                    JsonNode error=json.readTree(response.body());
                    invalid="invalid_grant".equals(error.path("error").asText()) || "KOE320".equals(error.path("error_code").asText());
                }
                throw failure(invalid);
            }
            String token=json.readTree(response.body()).path("access_token").asText();
            if(token.isBlank()) throw failure(false);
            var user=http.send(HttpRequest.newBuilder(URI.create(props.apiBaseUrl()+"/v2/user/me"))
                .timeout(Duration.ofSeconds(5)).header("Authorization","Bearer "+token).GET().build(),HttpResponse.BodyHandlers.ofString());
            if(user.statusCode()!=200) throw failure(false);
            JsonNode profile=json.readTree(user.body()), account=profile.path("kakao_account");
            if(!profile.path("id").canConvertToLong() || profile.path("id").asLong()<=0) throw failure(false);
            Gender gender=null;
            if(account.path("has_gender").asBoolean() && !account.path("gender_needs_agreement").asBoolean(true)) {
                gender=switch(account.path("gender").asText()) { case "male" -> Gender.MALE; case "female" -> Gender.FEMALE; default -> null; };
            }
            return new Profile(profile.path("id").asLong(),account.path("profile").path("nickname").asText(""),gender);
        } catch(ApiException e) { throw e; }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw failure(false); }
        catch(Exception e) { throw failure(false); } // Never retain/log provider payloads, codes or tokens.
    }
    private static String encode(String s) { return URLEncoder.encode(s,StandardCharsets.UTF_8); }
    private static ApiException failure(boolean invalid) {
        return new ApiException(ErrorCode.KAKAO_AUTH_FAILED,invalid ? "Kakao authorization code invalid or expired" : "Kakao authentication unavailable") {
            @Override public HttpStatus status() { return invalid ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY; }
        };
    }
}
