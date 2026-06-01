package com.order.management.lambdadynamodb.repository.exception;

public class DatabaseException extends RuntimeException {

  public DatabaseException(String message, Throwable t) {
    super(message, t);
  }
}
