package com.order.management.ec2ami.repository;

import com.order.management.ec2ami.entity.Order;
import com.order.management.ec2ami.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {

  Page<Order> findAllByStatus(OrderStatus status, Pageable pageable);
}
