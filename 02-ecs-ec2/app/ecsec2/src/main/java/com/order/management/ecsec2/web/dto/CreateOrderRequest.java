package com.order.management.ecsec2.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record CreateOrderRequest(

    @Schema(description = "Total order amount", example = "49.99")
    @NotNull
    @Positive
    BigDecimal totalAmount) {

}
