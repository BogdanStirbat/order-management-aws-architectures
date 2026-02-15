package com.order.management.ecsec2.repository;

import com.order.management.ecsec2.entity.Order;
import com.order.management.ecsec2.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {

  Page<Order> findAllByStatus(OrderStatus status, Pageable pageable);
}
