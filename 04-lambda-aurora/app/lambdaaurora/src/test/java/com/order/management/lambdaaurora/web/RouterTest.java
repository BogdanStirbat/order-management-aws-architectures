package com.order.management.lambdaaurora.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import com.order.management.lambdaaurora.service.OrderService;
import com.order.management.lambdaaurora.service.exception.OrderNotFoundException;
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

  @Mock
  private OrderService service;

  @InjectMocks
  private Router router;

  @Test
  void route_createsOrder_whenPostRequest() throws Exception {

    // given
    Order created = order(1L, OrderStatus.CREATED, new BigDecimal("49.99"));

    when(service.createOrder(new BigDecimal("49.99"))).thenReturn(created);

    APIGatewayV2HTTPEvent request = request("POST", "/orders");
    request.setBody("""
        {
          "totalAmount": 49.99
        }
        """);

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(201, response.getStatusCode());
    assertEquals("/orders/1", response.getHeaders().get("Location"));
    assertTrue(response.getBody().contains("\"id\":1"));
    assertTrue(response.getBody().contains("\"status\":\"CREATED\""));
    assertTrue(response.getBody().contains("\"totalAmount\":49.99"));
  }

  @Test
  void route_returns400_whenPostOrdersWithInvalidBody() throws Exception {

    // given
    APIGatewayV2HTTPEvent request = request("POST", "/orders");
    request.setBody("""
        {
          "totalAmount": -10.00
        }
        """);

    when(service.createOrder(new BigDecimal("-10.00")))
        .thenThrow(new IllegalArgumentException("totalAmount must be positive"));

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(400, response.getStatusCode());
  }

  @Test
  void route_returnsOrder_whenGetOrderByIdFound() throws Exception {

    // given
    Order order = order(1L, OrderStatus.CREATED, new BigDecimal("25.00"));

    when(service.getOrder(1L)).thenReturn(order);

    APIGatewayV2HTTPEvent request = request("GET", "/orders/1");

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(200, response.getStatusCode());
    assertTrue(response.getBody().contains("\"id\":1"));
    assertTrue(response.getBody().contains("\"status\":\"CREATED\""));
  }

  @Test
  void route_returns404_whenGetOrderByIdNotFound() throws Exception {

    // given
    when(service.getOrder(99L))
        .thenThrow(new OrderNotFoundException("Order not found: 99"));

    APIGatewayV2HTTPEvent request = request("GET", "/orders/99");

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(404, response.getStatusCode());
  }

  @Test
  void route_returns200_whenCancelOrderFound() throws Exception {

    // given
    Order cancelled = order(1L, OrderStatus.CANCELLED, new BigDecimal("100.00"));

    when(service.cancelOrder(1L)).thenReturn(cancelled);

    APIGatewayV2HTTPEvent request = request("PUT", "/orders/1/cancel");

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(200, response.getStatusCode());
    assertTrue(response.getBody().contains("\"id\":1"));
    assertTrue(response.getBody().contains("\"status\":\"CANCELLED\""));
  }

  @Test
  void route_returns404_whenCancelOrderNotFound() throws Exception {

    // given
    when(service.cancelOrder(99L))
        .thenThrow(new OrderNotFoundException("Order not found: 99"));

    APIGatewayV2HTTPEvent request = request("PUT", "/orders/99/cancel");

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(404, response.getStatusCode());
  }

  @Test
  void route_usesDefaults_whenListOrdersWithoutQueryParams() throws Exception {

    // given
    List<Order> orders = List.of(
        order(1L, OrderStatus.CREATED, new BigDecimal("10.00")),
        order(2L, OrderStatus.CREATED, new BigDecimal("20.00"))
    );

    when(service.listOrders(null, 0, 20)).thenReturn(orders);

    APIGatewayV2HTTPEvent request = request("GET", "/orders");

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(200, response.getStatusCode());
    assertTrue(response.getBody().contains("\"id\":1"));
    assertTrue(response.getBody().contains("\"id\":2"));
  }

  @Test
  void route_passesFiltersToService_whenListOrdersWithQueryParams() throws Exception {

    // given
    List<Order> orders = List.of(
        order(1L, OrderStatus.CREATED, new BigDecimal("10.00"))
    );

    when(service.listOrders(OrderStatus.CREATED, 2, 10)).thenReturn(orders);

    APIGatewayV2HTTPEvent request = request("GET", "/orders");
    request.setQueryStringParameters(Map.of(
        "status", "CREATED",
        "page", "2",
        "size", "10"
    ));

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(200, response.getStatusCode());
    assertTrue(response.getBody().contains("\"id\":1"));
    assertTrue(response.getBody().contains("\"status\":\"CREATED\""));
  }

  @Test
  void route_returns400_whenListOrdersWithInvalidStatus() {

    // given
    APIGatewayV2HTTPEvent request = request("GET", "/orders");
    request.setQueryStringParameters(Map.of("status", "INVALID"));

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(400, response.getStatusCode());
  }

  @Test
  void route_returns404_whenUnknownPath() {

    // given
    APIGatewayV2HTTPEvent request = request("GET", "/unknown");

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(404, response.getStatusCode());
  }

  @Test
  void route_returns500_whenUnexpectedException() throws Exception {

    // given
    when(service.getOrder(1L)).thenThrow(new SQLException("database down"));

    APIGatewayV2HTTPEvent request = request("GET", "/orders/1");

    LambdaLogger logger = mock(LambdaLogger.class);
    Context context = mock(Context.class);
    when(context.getLogger()).thenReturn(logger);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(500, response.getStatusCode());
  }

  @Test
  void route_trailingSlash_isNormalized() throws Exception {

    // given
    Order order = order(1L, OrderStatus.CREATED, new BigDecimal("25.00"));

    when(service.getOrder(1L)).thenReturn(order);

    APIGatewayV2HTTPEvent request = request("GET", "/orders/1/");

    Context context = mock(Context.class);

    // when
    APIGatewayV2HTTPResponse response = router.route(request, context);

    // then
    assertEquals(200, response.getStatusCode());
    verify(service).getOrder(1L);
  }

  private static APIGatewayV2HTTPEvent request(String method, String path) {
    APIGatewayV2HTTPEvent event = new APIGatewayV2HTTPEvent();

    APIGatewayV2HTTPEvent.RequestContext requestContext =
        new APIGatewayV2HTTPEvent.RequestContext();

    APIGatewayV2HTTPEvent.RequestContext.Http http =
        new APIGatewayV2HTTPEvent.RequestContext.Http();

    http.setMethod(method);
    http.setPath(path);

    requestContext.setHttp(http);
    event.setRequestContext(requestContext);

    return event;
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
