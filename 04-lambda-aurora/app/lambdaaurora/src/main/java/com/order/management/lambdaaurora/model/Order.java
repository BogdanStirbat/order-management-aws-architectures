package com.order.management.lambdaaurora.model;

import java.math.BigDecimal;
import java.time.Instant;

public record Order(
    Long id,
    long version,
    OrderStatus status,
    BigDecimal totalAmount,
    Instant createdAt,
    Instant updatedAt
) {}