package com.order.management.ecsec2.service.exception;

public class OrderNotFoundException extends RuntimeException {

  public OrderNotFoundException(Long id) {
    super("Order not found: " + id);
  }
}
