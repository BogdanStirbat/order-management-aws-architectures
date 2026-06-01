package com.order.management.lambdadynamodb.web.dto;

import java.math.BigDecimal;

public record CreateOrderRequest(BigDecimal totalAmount) { }
