package com.order.management.ecsec2.web.dto;

import com.order.management.ecsec2.enums.OrderStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;

public record OrderResponse(

    @Schema(example = "123")
    @NotNull
    Long id,

    @NotNull
    OrderStatus status,

    @Schema(example = "49.99")
    @NotNull
    BigDecimal totalAmount,

    @Schema(example = "2026-01-04T10:15:30Z")
    @NotNull
    Instant createdAt,

    @Schema(example = "2026-01-04T10:15:30Z")
    @NotNull
    Instant updatedAt) {

}
