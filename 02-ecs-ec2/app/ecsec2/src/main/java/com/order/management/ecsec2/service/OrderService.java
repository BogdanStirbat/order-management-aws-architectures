package com.order.management.ecsec2.service;

import com.order.management.ecsec2.entity.Order;
import com.order.management.ecsec2.enums.OrderStatus;
import com.order.management.ecsec2.repository.OrderRepository;
import com.order.management.ecsec2.service.exception.OrderNotFoundException;
import java.math.BigDecimal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

  private final OrderRepository orderRepository;

  public OrderService(OrderRepository orderRepository) {
    this.orderRepository = orderRepository;
  }

  @Transactional
  public Order createOrder(BigDecimal totalAmount) {

    Order order = new Order();
    order.setTotalAmount(totalAmount);
    order.setStatus(OrderStatus.CREATED);

    return orderRepository.save(order);
  }

  @Transactional(readOnly = true)
  public Order getOrder(Long id) {

    return orderRepository.findById(id)
        .orElseThrow(() -> new OrderNotFoundException(id));
  }

  @Transactional
  public Order cancelOrder(Long id) {

    Order order = orderRepository.findById(id)
        .orElseThrow(() -> new OrderNotFoundException(id));

    if (order.getStatus() == OrderStatus.CANCELLED) {
      return order;
    }

    order.setStatus(OrderStatus.CANCELLED);
    return orderRepository.save(order);
  }

  @Transactional(readOnly = true)
  public Page<Order> getOrders(OrderStatus status, Pageable pageable) {
    if (status == null) {
      return orderRepository.findAll(pageable);
    }
    return orderRepository.findAllByStatus(status, pageable);
  }
}
