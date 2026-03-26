package com.order.management.ecsfargate.repository;

import com.order.management.ecsfargate.entity.Order;
import com.order.management.ecsfargate.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {

  Page<Order> findAllByStatus(OrderStatus status, Pageable pageable);
}
