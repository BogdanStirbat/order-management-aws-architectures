package com.order.management.ec2ami.web.advice;

import com.order.management.ec2ami.service.exception.OrderNotFoundException;
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
