package com.order.management.ecsec2.web.mapper;

import com.order.management.ecsec2.entity.Order;
import com.order.management.ecsec2.web.dto.OrderResponse;

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
