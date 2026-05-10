package com.order.management.lambdaaurora.repository.exception;

public class DatabaseException extends RuntimeException {

  public DatabaseException(String message, Throwable t) {
    super(message, t);
  }
}
