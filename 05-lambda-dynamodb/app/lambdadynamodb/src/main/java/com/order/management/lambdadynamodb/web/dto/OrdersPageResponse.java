package com.order.management.lambdadynamodb.web.dto;

import java.util.List;

public record OrdersPageResponse(
    List<OrderResponse> orders,
    String nextToken) {

}
