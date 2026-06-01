package com.order.management.lambdadynamodb.web.dto;

import com.order.management.lambdadynamodb.model.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;

public record OrderResponse(
    String id,
    long version,
    OrderStatus status,
    BigDecimal totalAmount,
    Instant createdAt,
    Instant updatedAt
) { }