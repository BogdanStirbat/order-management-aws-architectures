package com.order.management.eksmanagednode.repository;

import com.order.management.eksmanagednode.entity.Order;
import com.order.management.eksmanagednode.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {

  Page<Order> findAllByStatus(OrderStatus status, Pageable pageable);
}
