package com.order.management.lambdaaurora.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import com.order.management.lambdaaurora.service.OrderService;
import com.order.management.lambdaaurora.service.exception.OrderNotFoundException;
import com.order.management.lambdaaurora.web.dto.CreateOrderRequest;
import com.order.management.lambdaaurora.web.dto.OrderResponse;
import com.order.management.lambdaaurora.web.dto.http.HttpRequest;
import com.order.management.lambdaaurora.web.dto.http.HttpResponse;
import java.util.List;
import java.util.Map;

public class Router {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .registerModule(new JavaTimeModule());

  private final OrderService service;

  public Router(OrderService service) {
    this.service = service;
  }

  public HttpResponse route(HttpRequest request) {
    try {
      String method = request.method();
      String path = normalizePath(request.path());

      if ("POST".equals(method) && "/orders".equals(path)) {
        CreateOrderRequest createOrderRequest = extractCreateOrderRequest(request);

        Order created = service.createOrder(createOrderRequest.totalAmount());

        return ApiResponse.json(
            201,
            toResponse(created),
            Map.of("Location", "/orders/" + created.id())
        );
      }

      if ("GET".equals(method) && path.matches("^/orders/\\d+$")) {
        long id = Long.parseLong(path.substring("/orders/".length()));
        return ApiResponse.json(200, toResponse(service.getOrder(id)));
      }

      if ("PUT".equals(method) && path.matches("^/orders/\\d+/cancel$")) {
        String idPart = path.substring("/orders/".length(), path.length() - "/cancel".length());
        long id = Long.parseLong(idPart);
        return ApiResponse.json(200, toResponse(service.cancelOrder(id)));
      }

      if ("GET".equals(method) && "/orders".equals(path)) {
        Map<String, String> query = request.query();

        OrderStatus status = parseStatus(query);
        int page = parseInt(query, "page", 0);
        int size = parseInt(query, "size", 20);

        List<OrderResponse> orders = service.listOrders(status, page, size)
            .stream()
            .map(this::toResponse)
            .toList();

        return ApiResponse.json(200, orders);
      }

      return ApiResponse.error(404, "Route not found");

    } catch (IllegalArgumentException ex) {
      return ApiResponse.error(400, ex.getMessage());
    } catch (OrderNotFoundException ex) {
      return ApiResponse.error(404, ex.getMessage());
    } catch (Exception ex) {
      return ApiResponse.error(500, "Internal server error");
    }
  }

  private String requiredBody(HttpRequest request) {
    if (request.body() == null || request.body().isBlank()) {
      throw new IllegalArgumentException("Request body is required");
    }

    return request.body();
  }

  private CreateOrderRequest extractCreateOrderRequest(HttpRequest request)  {

    String body = requiredBody(request);

    try {
      return MAPPER.readValue(
          body,
          CreateOrderRequest.class
      );
    } catch (Exception e) {
      throw new IllegalArgumentException("Malformed JSON request body");
    }
  }

  private OrderStatus parseStatus(Map<String, String> query) {
    String value = queryValue(query, "status");

    if (value == null || value.isBlank()) {
      return null;
    }

    try {
      return OrderStatus.valueOf(value);
    } catch (IllegalArgumentException ex) {
      throw new IllegalArgumentException("status must be one of: CREATED, CANCELLED");
    }
  }

  private int parseInt(Map<String, String> query, String key, int fallback) {
    String value = queryValue(query, key);

    if (value == null || value.isBlank()) {
      return fallback;
    }

    try {
      return Integer.parseInt(value);
    } catch (NumberFormatException ex) {
      throw new IllegalArgumentException(key + " must be an integer");
    }
  }

  private String queryValue(Map<String, String> query, String key) {
    if (query == null) {
      return null;
    }

    return query.get(key);
  }

  private String normalizePath(String path) {
    if (path == null || path.isBlank()) {
      return "/";
    }

    return path.endsWith("/") && path.length() > 1
        ? path.substring(0, path.length() - 1)
        : path;
  }

  private OrderResponse toResponse(Order order) {
    return new OrderResponse(
        order.id(),
        order.status(),
        order.totalAmount(),
        order.createdAt(),
        order.updatedAt()
    );
  }
}
