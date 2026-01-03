package com.order.management.ec2ami.web.mapper;

import com.order.management.ec2ami.entity.Order;
import com.order.management.ec2ami.web.dto.OrderResponse;

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
