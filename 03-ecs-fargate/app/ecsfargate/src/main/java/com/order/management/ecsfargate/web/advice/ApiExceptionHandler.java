package com.order.management.ecsfargate.web.advice;

import com.order.management.ecsfargate.service.exception.OrderNotFoundException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

  @ExceptionHandler(OrderNotFoundException.class)
  public ResponseEntity<Void> handleNotFound(OrderNotFoundException ex) {
    return ResponseEntity.notFound().build();
  }
}
