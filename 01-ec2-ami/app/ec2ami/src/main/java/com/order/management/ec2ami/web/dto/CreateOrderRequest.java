package com.order.management.ec2ami.web.dto;

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
