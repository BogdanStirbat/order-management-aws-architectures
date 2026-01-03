package com.order.management.ec2ami.web.dto;

import com.order.management.ec2ami.enums.OrderStatus;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;

public record OrderResponse(

    @NotNull
    Long id,

    @NotNull
    OrderStatus status,

    @NotNull
    BigDecimal totalAmount,

    @NotNull
    Instant createdAt,

    @NotNull
    Instant updatedAt) {

}
