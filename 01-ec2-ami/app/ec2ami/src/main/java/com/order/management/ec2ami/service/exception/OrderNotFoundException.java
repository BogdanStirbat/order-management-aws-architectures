package com.order.management.ec2ami.service.exception;

public class OrderNotFoundException extends RuntimeException {

  public OrderNotFoundException(Long id) {
    super("Order not found: " + id);
  }
}
