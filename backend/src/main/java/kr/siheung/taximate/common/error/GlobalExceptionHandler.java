package kr.siheung.taximate.common.error;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApi(ApiException e) {
        return ResponseEntity.status(e.code().status())
                .body(new ErrorResponse(e.code().name(), e.getMessage(), e.details()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        Map<String, Object> fields = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> fields.put(f.getField(), f.getDefaultMessage()));
        return build(ErrorCode.VALIDATION_FAILED, "Invalid request", fields);
    }

    @ExceptionHandler({HandlerMethodValidationException.class, HttpMessageNotReadableException.class,
            IllegalArgumentException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    public ResponseEntity<ErrorResponse> handleBadRequest(Exception e) {
        return build(ErrorCode.VALIDATION_FAILED, "Invalid request", Map.of());
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleOptimistic(ObjectOptimisticLockingFailureException e) {
        return build(ErrorCode.LOCK_TIMEOUT, "Concurrent update, please retry", Map.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoResource(NoResourceFoundException e) {
        return build(ErrorCode.NOT_FOUND, "Not found", Map.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleOther(Exception e) {
        log.error("Unhandled error", e);
        return build(ErrorCode.INTERNAL_ERROR, "Internal error", Map.of());
    }

    private ResponseEntity<ErrorResponse> build(ErrorCode code, String message, Map<String, Object> details) {
        return ResponseEntity.status(code.status()).body(new ErrorResponse(code.name(), message, details));
    }
}
