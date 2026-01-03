package com.order.management.ec2ami.web;

import com.order.management.ec2ami.entity.Order;
import com.order.management.ec2ami.service.OrderService;
import com.order.management.ec2ami.web.dto.CreateOrderRequest;
import com.order.management.ec2ami.web.dto.OrderResponse;
import com.order.management.ec2ami.web.mapper.OrderMapper;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/orders")
public class OrderController {

  private final OrderService orderService;

  public OrderController(OrderService orderService) {
    this.orderService = orderService;
  }

  @PostMapping
  public ResponseEntity<OrderResponse> createOrder(
      @RequestBody @Valid CreateOrderRequest request,
      UriComponentsBuilder uriComponentsBuilder) {

    Order order = orderService.createOrder(request.totalAmount());

    return ResponseEntity.created(
        uriComponentsBuilder.path("/orders/{id}")
            .buildAndExpand(order.getId())
            .toUri()
    ).body(OrderMapper.toResponse(order));
  }

  @GetMapping("/{id}")
  public ResponseEntity<OrderResponse> getOrder(@PathVariable Long id) {

    Order order = orderService.getOrder(id);

    return ResponseEntity.ok(OrderMapper.toResponse(order));
  }
}
