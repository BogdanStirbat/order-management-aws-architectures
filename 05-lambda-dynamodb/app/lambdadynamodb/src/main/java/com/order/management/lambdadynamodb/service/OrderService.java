package com.order.management.lambdadynamodb.service;

import com.order.management.lambdadynamodb.model.Order;
import com.order.management.lambdadynamodb.model.OrderStatus;
import com.order.management.lambdadynamodb.repository.OrderPage;
import com.order.management.lambdadynamodb.repository.OrderRepository;
import com.order.management.lambdadynamodb.service.exception.OrderNotFoundException;
import java.math.BigDecimal;

public class OrderService {

  private final OrderRepository repository;

  public OrderService(OrderRepository repository) {
    this.repository = repository;
  }

  public Order createOrder(BigDecimal totalAmount) {
    if (totalAmount == null || totalAmount.signum() <= 0) {
      throw new IllegalArgumentException("totalAmount must be positive");
    }
    return repository.create(totalAmount);
  }

  public Order getOrder(String id) {
    return repository.findById(id)
        .orElseThrow(() -> new OrderNotFoundException("Order not found: " + id));
  }

  public Order cancelOrder(String id) {
    Order order = repository.cancel(id);
    if (order == null) {
      throw new OrderNotFoundException("Order not found: " + id);
    }
    return order;
  }

  public OrderPage listOrders(OrderStatus status, int limit, String nextToken) {
    if (limit <= 0) {
      throw new IllegalArgumentException("page must be greater than or equal to 0");
    }

    return repository.findAll(status, limit, nextToken);
  }
}
