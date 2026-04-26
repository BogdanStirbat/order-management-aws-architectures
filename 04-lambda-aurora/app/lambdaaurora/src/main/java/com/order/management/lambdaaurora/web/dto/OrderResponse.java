package com.order.management.lambdaaurora.web.dto;

import com.order.management.lambdaaurora.model.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;

public record OrderResponse(
    Long id,
    OrderStatus status,
    BigDecimal totalAmount,
    Instant createdAt,
    Instant updatedAt
) { }