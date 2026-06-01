package com.order.management.lambdadynamodb.model;

import java.math.BigDecimal;
import java.time.Instant;

public record Order(
    String id,
    long version,
    OrderStatus status,
    BigDecimal totalAmount,
    Instant createdAt,
    Instant updatedAt
) {}