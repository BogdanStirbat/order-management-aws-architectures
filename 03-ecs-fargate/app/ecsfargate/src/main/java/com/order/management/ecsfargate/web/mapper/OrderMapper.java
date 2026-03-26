package com.order.management.ecsfargate.web.mapper;

import com.order.management.ecsfargate.entity.Order;
import com.order.management.ecsfargate.web.dto.OrderResponse;

public final class OrderMapper {

  private OrderMapper() {

  }

  public static OrderResponse toResponse(Order order) {

    return new OrderResponse(
        order.getId(),
        order.getStatus(),
        order.getTotalAmount(),
        order.getCreatedAt(),
        order.getUpdatedAt()
    );
  }
}
