package com.order.management.ec2ami.service;

import com.order.management.ec2ami.entity.Order;
import com.order.management.ec2ami.enums.OrderStatus;
import com.order.management.ec2ami.repository.OrderRepository;
import com.order.management.ec2ami.service.exception.OrderNotFoundException;
import java.math.BigDecimal;
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
}
