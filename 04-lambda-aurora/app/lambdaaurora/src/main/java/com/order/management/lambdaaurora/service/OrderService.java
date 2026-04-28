package com.order.management.lambdaaurora.service;

import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import com.order.management.lambdaaurora.repository.OrderRepository;
import com.order.management.lambdaaurora.service.exception.OrderNotFoundException;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.List;

public class OrderService {

  private final OrderRepository repository;

  public OrderService(OrderRepository repository) {
    this.repository = repository;
  }

  public Order createOrder(BigDecimal totalAmount) throws SQLException {
    if (totalAmount == null || totalAmount.signum() <= 0) {
      throw new IllegalArgumentException("totalAmount must be positive");
    }
    return repository.create(totalAmount);
  }

  public Order getOrder(long id) throws SQLException {
    return repository.findById(id)
        .orElseThrow(() -> new OrderNotFoundException("Order not found: " + id));
  }

  public Order cancelOrder(long id) throws SQLException {
    Order order = repository.cancel(id);
    if (order == null) {
      throw new OrderNotFoundException("Order not found: " + id);
    }
    return order;
  }

  public List<Order> listOrders(OrderStatus status, int page, int size) throws SQLException {
    if (page < 0) {
      throw new IllegalArgumentException("page must be greater than or equal to 0");
    }
    if (size < 1 || size > 100) {
      throw new IllegalArgumentException("size must be between 1 and 100");
    }
    return repository.findAll(status, size, page * size);
  }
}
