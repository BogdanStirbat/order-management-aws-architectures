package com.order.management.lambdaaurora.web.dto;

import java.math.BigDecimal;

public record CreateOrderRequest(BigDecimal totalAmount) { }
