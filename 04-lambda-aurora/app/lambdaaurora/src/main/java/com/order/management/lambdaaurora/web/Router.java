package com.order.management.lambdaaurora.web;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import com.order.management.lambdaaurora.service.OrderService;
import com.order.management.lambdaaurora.service.exception.OrderNotFoundException;
import com.order.management.lambdaaurora.web.dto.CreateOrderRequest;
import com.order.management.lambdaaurora.web.dto.OrderResponse;
import java.util.List;
import java.util.Map;

public class Router {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .registerModule(new JavaTimeModule());

  private final OrderService service;

  public Router(OrderService service) {
    this.service = service;
  }

  public APIGatewayV2HTTPResponse route(APIGatewayV2HTTPEvent event, Context context) {
    try {
      String method = event
          .getRequestContext()
          .getHttp()
          .getMethod();
      String rawPath = event.getRequestContext().getHttp().getPath();
      String path = normalizePath(rawPath);

      if ("POST".equals(method) && "/orders".equals(path)) {
        CreateOrderRequest request = MAPPER.readValue(event.getBody(), CreateOrderRequest.class);
        Order created = service.createOrder(request.totalAmount());

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
        Map<String, String> qs = event.getQueryStringParameters();

        OrderStatus status = null;
        if (qs != null && qs.get("status") != null && !qs.get("status").isBlank()) {
          status = OrderStatus.valueOf(qs.get("status"));
        }

        int page = parseInt(qs, "page", 0);
        int size = parseInt(qs, "size", 20);

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
      context.getLogger().log("Request failed: " + ex.getMessage());
      return ApiResponse.error(500, "Internal server error");
    }
  }

  private String normalizePath(String path) {
    if (path == null || path.isBlank()) return "/";
    return path.endsWith("/") && path.length() > 1
        ? path.substring(0, path.length() - 1)
        : path;
  }

  private int parseInt(Map<String, String> qs, String key, int fallback) {
    if (qs == null || qs.get(key) == null) return fallback;
    return Integer.parseInt(qs.get(key));
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
