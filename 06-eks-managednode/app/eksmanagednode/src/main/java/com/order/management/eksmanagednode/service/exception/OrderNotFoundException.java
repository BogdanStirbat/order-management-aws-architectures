package com.order.management.eksmanagednode.service.exception;

public class OrderNotFoundException extends RuntimeException {

  public OrderNotFoundException(Long id) {
    super("Order not found: " + id);
  }
}
