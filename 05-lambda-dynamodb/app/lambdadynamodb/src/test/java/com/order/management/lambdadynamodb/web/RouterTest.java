package com.order.management.lambdadynamodb.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.order.management.lambdadynamodb.model.Order;
import com.order.management.lambdadynamodb.model.OrderStatus;
import com.order.management.lambdadynamodb.repository.OrderPage;
import com.order.management.lambdadynamodb.service.OrderService;
import com.order.management.lambdadynamodb.service.exception.OrderNotFoundException;
import com.order.management.lambdadynamodb.web.dto.http.HttpRequest;
import com.order.management.lambdadynamodb.web.dto.http.HttpResponse;
import java.math.BigDecimal;
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
    Order created = order("order-id", OrderStatus.CREATED, new BigDecimal("49.99"));
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
    assertEquals("/orders/order-id", response.headers().get("Location"));

    String body = json(response.body());
    assertTrue(body.contains("\"id\":\"order-id\""));
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
    Order order = order("order-id", OrderStatus.CREATED, new BigDecimal("25.00"));
    when(service.getOrder("order-id")).thenReturn(order);

    // when
    HttpResponse response = router.route(request("GET", "/orders/order-id"));

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":\"order-id\""));
    assertTrue(body.contains("\"status\":\"CREATED\""));
  }

  @Test
  void route_returns404_whenGetOrderByIdNotFound() {

    // given
    when(service.getOrder("not-found"))
        .thenThrow(new OrderNotFoundException("Order not found: 99"));

    // when
    HttpResponse response = router.route(request("GET", "/orders/not-found"));

    // then
    assertEquals(404, response.statusCode());
  }

  @Test
  void route_returns200_whenCancelOrderFound() throws Exception {

    // given
    Order cancelled = order("order-id", OrderStatus.CANCELLED, new BigDecimal("100.00"));
    when(service.cancelOrder("order-id")).thenReturn(cancelled);

    // when
    HttpResponse response = router.route(request("PUT", "/orders/order-id/cancel"));

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":\"order-id\""));
    assertTrue(body.contains("\"status\":\"CANCELLED\""));
  }

  @Test
  void route_returns404_whenCancelOrderNotFound() {

    // given
    when(service.cancelOrder("not-found"))
        .thenThrow(new OrderNotFoundException("Order not found: not-found"));

    // when
    HttpResponse response = router.route(request("PUT", "/orders/not-found/cancel"));

    // then
    assertEquals(404, response.statusCode());
  }

  @Test
  void route_usesDefaults_whenListOrdersWithoutQueryParams() throws Exception {

    // given
    List<Order> orders = List.of(
        order("order-id-1", OrderStatus.CREATED, new BigDecimal("10.00")),
        order("order-id-2", OrderStatus.CREATED, new BigDecimal("20.00"))
    );
    OrderPage orderPage = new OrderPage(orders, "nextToken");
    when(service.listOrders(null, 20, null)).thenReturn(orderPage);

    // when
    HttpResponse response = router.route(request("GET", "/orders"));

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":\"order-id-1\""));
    assertTrue(body.contains("\"id\":\"order-id-2\""));
  }

  @Test
  void route_passesFiltersToService_whenListOrdersWithQueryParams() throws Exception {

    // given
    List<Order> orders = List.of(
        order("order-id", OrderStatus.CREATED, new BigDecimal("10.00"))
    );
    OrderPage orderPage = new OrderPage(orders, "nextToken");
    when(service.listOrders(OrderStatus.CREATED, 2, "nextToken")).thenReturn(orderPage);
    HttpRequest request = request(
        "GET",
        "/orders",
        Map.of(
            "status", "CREATED",
            "limit", "2",
            "nextToken", "nextToken"
        ),
        null
    );

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(200, response.statusCode());

    String body = json(response.body());
    assertTrue(body.contains("\"id\":\"order-id\""));
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
  void route_returns400_whenListOrdersWithInvalidLimit() {

    // given
    HttpRequest request = request(
        "GET",
        "/orders",
        Map.of("limit", "abc"),
        null
    );

    // when
    HttpResponse response = router.route(request);

    // then
    assertEquals(400, response.statusCode());
    assertTrue(response.body().toString().contains("limit must be an integer"));
  }

  @Test
  void route_returns404_whenUnknownPath() {

    // when
    HttpResponse response = router.route(request("GET", "/unknown"));

    // then
    assertEquals(404, response.statusCode());
  }

  @Test
  void route_propagatesException_whenUnexpectedException() {

    // given
    when(service.getOrder("order-id")).thenThrow(new RuntimeException("unexpected exception"));

    // when && then
    assertThrows(RuntimeException.class,
        () -> router.route(request("GET", "/orders/order-id")));
  }

  @Test
  void route_trailingSlash_isNormalized() {

    // given
    Order order = order("order-id", OrderStatus.CREATED, new BigDecimal("25.00"));
    when(service.getOrder("order-id")).thenReturn(order);

    // when
    HttpResponse response = router.route(request("GET", "/orders/order-id/"));

    // then
    assertEquals(200, response.statusCode());
    verify(service).getOrder("order-id");
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

  private static Order order(String id, OrderStatus status, BigDecimal totalAmount) {
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
