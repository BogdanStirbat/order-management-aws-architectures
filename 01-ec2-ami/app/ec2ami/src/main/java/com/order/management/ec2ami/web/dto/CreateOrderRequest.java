package com.order.management.ec2ami.web.dto;

import java.math.BigDecimal;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record CreateOrderRequest(

    @NotNull
    @Positive
    BigDecimal totalAmount) {

}
