package com.order.management.ec2ami.repository;

import com.order.management.ec2ami.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {

}
