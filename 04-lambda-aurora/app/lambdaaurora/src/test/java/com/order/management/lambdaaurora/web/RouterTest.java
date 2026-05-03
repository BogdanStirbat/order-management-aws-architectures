package com.order.management.lambdaaurora.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import com.order.management.lambdaaurora.service.OrderService;
import com.order.management.lambdaaurora.service.exception.OrderNotFoundException;
import com.order.management.lambdaaurora.web.dto.http.HttpRequest;
import com.order.management.lambdaaurora.web.dto.http.HttpResponse;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
public class RouterTest {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .registerModule(new JavaTimeModule());

  @Mock
  private OrderService service;

  @InjectMocks
  private Router router;

  @Test
  void route_createsOrder_whenPostRequest() throws Exception {

    // given
    Order created = order(1L, OrderStatus.CREATED, new BigDecimal("49.99"));
    when(service.createOrder(new BigDecimal("49.99"))).thenReturn(created);
    HttpRequest request = request("POST", "/orders", null, """
        {
          "totalAmount": 49.99
        }
        """);

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(201, response.statusCode());
    assertEquals("/orders/1", response.headers().get("Location"));

    String body = json(response.body());
    assertTrue(body.contains("\"id\":1"));
    assertTrue(body.contains("\"status\":\"CREATED\""));
    assertTrue(body.contains("\"totalAmount\":49.99"));
  }

  @Test
  void route_returns400_whenPostOrdersWithInvalidBody() throws Exception {

    // given
    HttpRequest request = request("POST", "/orders", null, """
        {
          "totalAmount": -10.00
        }
        """);
    when(service.createOrder(new BigDecimal("-10.00")))
        .thenThrow(new IllegalArgumentException("totalAmount must be positive"));

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(400, response.statusCode());
    assertTrue(json(response.body()).contains("totalAmount must be positive"));
  }

  @Test
  void route_returns400_whenPostOrdersWithoutBody() {

    // given
    HttpRequest request = request("POST", "/orders", null, null);

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(400, response.statusCode());
    assertTrue(response.body().toString().contains("Request body is required"));
  }

  @Test
  void route_returns400_whenPostOrdersWithMalformedJson() {

    // given
    HttpRequest request = request("POST", "/orders", null, "{");

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(400, response.statusCode());
    assertTrue(response.body().toString().contains("Malformed JSON request body"));
  }

  @Test
  void route_returnsOrder_whenGetOrderByIdFound() throws Exception {

    // given
    Order order = order(1L, OrderStatus.CREATED, new BigDecimal("25.00"));
    when(service.getOrder(1L)).thenReturn(order);

    // when
    HttpResponse response = router.route(request("GET", "/orders/1"));

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":1"));
    assertTrue(body.contains("\"status\":\"CREATED\""));
  }

  @Test
  void route_returns404_whenGetOrderByIdNotFound() throws Exception {

    // given
    when(service.getOrder(99L))
        .thenThrow(new OrderNotFoundException("Order not found: 99"));

    // when
    HttpResponse response = router.route(request("GET", "/orders/99"));

    // then
    assertEquals(404, response.statusCode());
  }

  @Test
  void route_returns200_whenCancelOrderFound() throws Exception {

    // given
    Order cancelled = order(1L, OrderStatus.CANCELLED, new BigDecimal("100.00"));
    when(service.cancelOrder(1L)).thenReturn(cancelled);

    // when
    HttpResponse response = router.route(request("PUT", "/orders/1/cancel"));

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":1"));
    assertTrue(body.contains("\"status\":\"CANCELLED\""));
  }

  @Test
  void route_returns404_whenCancelOrderNotFound() throws Exception {

    // given
    when(service.cancelOrder(99L))
        .thenThrow(new OrderNotFoundException("Order not found: 99"));

    // when
    HttpResponse response = router.route(request("PUT", "/orders/99/cancel"));

    // then
    assertEquals(404, response.statusCode());
  }

  @Test
  void route_usesDefaults_whenListOrdersWithoutQueryParams() throws Exception {

    // given
    List<Order> orders = List.of(
        order(1L, OrderStatus.CREATED, new BigDecimal("10.00")),
        order(2L, OrderStatus.CREATED, new BigDecimal("20.00"))
    );
    when(service.listOrders(null, 0, 20)).thenReturn(orders);

    // when
    HttpResponse response = router.route(request("GET", "/orders"));

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":1"));
    assertTrue(body.contains("\"id\":2"));
  }

  @Test
  void route_passesFiltersToService_whenListOrdersWithQueryParams() throws Exception {

    // given
    List<Order> orders = List.of(
        order(1L, OrderStatus.CREATED, new BigDecimal("10.00"))
    );
    when(service.listOrders(OrderStatus.CREATED, 2, 10)).thenReturn(orders);
    HttpRequest request = request(
        "GET",
        "/orders",
        Map.of(
            "status", "CREATED",
            "page", "2",
            "size", "10"
        ),
        null
    );

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":1"));
    assertTrue(body.contains("\"status\":\"CREATED\""));
  }

  @Test
  void route_returns400_whenListOrdersWithInvalidStatus() {

    // given
    HttpRequest request = request(
        "GET",
        "/orders",
        Map.of("status", "INVALID"),
        null
    );

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(400, response.statusCode());
    assertTrue(response.body().toString().contains("status must be one of: CREATED, CANCELLED"));
  }

  @Test
  void route_returns400_whenListOrdersWithInvalidPage() {

    // given
    HttpRequest request = request(
        "GET",
        "/orders",
        Map.of("page", "abc"),
        null
    );

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(400, response.statusCode());
    assertTrue(response.body().toString().contains("page must be an integer"));
  }

  @Test
  void route_returns400_whenListOrdersWithInvalidSize() {

    // given
    HttpRequest request = request(
        "GET",
        "/orders",
        Map.of("size", "abc"),
        null
    );

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(400, response.statusCode());
    assertTrue(response.body().toString().contains("size must be an integer"));
  }

  @Test
  void route_returns404_whenUnknownPath() {

    // when
    HttpResponse response = router.route(request("GET", "/unknown"));

    // then
    assertEquals(404, response.statusCode());
  }

  @Test
  void route_returns500_whenUnexpectedException() throws Exception {

    // given
    when(service.getOrder(1L)).thenThrow(new SQLException("database down"));

    // when
    HttpResponse response = router.route(request("GET", "/orders/1"));

    // then
    assertEquals(500, response.statusCode());
  }

  @Test
  void route_trailingSlash_isNormalized() throws Exception {

    // given
    Order order = order(1L, OrderStatus.CREATED, new BigDecimal("25.00"));
    when(service.getOrder(1L)).thenReturn(order);

    // when
    HttpResponse response = router.route(request("GET", "/orders/1/"));

    // then
    assertEquals(200, response.statusCode());
    verify(service).getOrder(1L);
  }

  private static HttpRequest request(String method, String path) {
    return request(method, path, Map.of(), null);
  }

  private static HttpRequest request(
      String method,
      String path,
      Map<String, String> query,
      String body
  ) {
    return new HttpRequest(
        method,
        path,
        query == null ? Map.of() : query,
        body
    );
  }

  private static String json(Object value) throws Exception {
    return MAPPER.writeValueAsString(value);
  }

  private static Order order(Long id, OrderStatus status, BigDecimal totalAmount) {
    return new Order(
        id,
        status == OrderStatus.CANCELLED ? 1L : 0L,
        status,
        totalAmount,
        Instant.parse("2026-01-01T10:00:00Z"),
        Instant.parse("2026-01-01T10:05:00Z")
    );
  }
}
