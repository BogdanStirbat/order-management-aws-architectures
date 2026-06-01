package com.order.management.lambdadynamodb.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.order.management.lambdadynamodb.model.Order;
import com.order.management.lambdadynamodb.model.OrderStatus;
import com.order.management.lambdadynamodb.model.OrderPage;
import com.order.management.lambdadynamodb.repository.OrderRepository;
import com.order.management.lambdadynamodb.service.exception.OrderNotFoundException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
public class OrderServiceTest {

  @Mock
  private OrderRepository repository;

  @InjectMocks
  private OrderService service;

  @Test
  void createOrder_createsOrder_whenTotalAmountIsPositive() {

    // given
    BigDecimal totalAmount = new BigDecimal("49.99");
    Order expected = order("order-id", OrderStatus.CREATED, totalAmount);

    when(repository.create(totalAmount)).thenReturn(expected);

    // when
    Order actual = service.createOrder(totalAmount);

    // then
    assertEquals(expected, actual);
  }

  @Test
  void createOrder_throwsIllegalArgumentException_whenTotalAmountIsNull() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.createOrder(null)
    );
  }

  @Test
  void createOrder_throwsIllegalArgumentException_whenTotalAmountIsZero() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.createOrder(BigDecimal.ZERO)
    );
  }

  @Test
  void getOrder_returnsOrder_whenOrderExists() {

    // given
    Order expected = order("order-id", OrderStatus.CREATED, new BigDecimal("25.00"));

    when(repository.findById("order-id")).thenReturn(Optional.of(expected));

    // when
    Order actual = service.getOrder("order-id");

    // then
    assertEquals(expected, actual);
  }

  @Test
  void getOrder_throwsOrderNotFoundException_whenOrderDoesNotExist() {

    // given
    when(repository.findById("order-id-inexistent")).thenReturn(Optional.empty());

    // when && then
    assertThrows(
        OrderNotFoundException.class,
        () -> service.getOrder("order-id-inexistent")
    );
  }

  @Test
  void cancelOrder_returnsCancelledOrder_whenOrderExists() {

    // given
    Order cancelled = order("order-id", OrderStatus.CANCELLED, new BigDecimal("100.00"));

    when(repository.cancel("order-id")).thenReturn(cancelled);

    // when
    Order actual = service.cancelOrder("order-id");

    // then
    assertEquals(cancelled, actual);
  }

  @Test
  void cancelOrder_throwsOrderNotFoundException_whenOrderDoesNotExist() {

    // given
    when(repository.cancel("order-id-not-found")).thenReturn(null);

    // when && then
    assertThrows(
        OrderNotFoundException.class,
        () -> service.cancelOrder("order-id-not-found")
    );
  }

  @Test
  void listOrders_returnsOrders_whenArgumentsAreValid() {

    // given
    List<Order> expectedOrders = List.of(
        order("order-id-1", OrderStatus.CREATED, new BigDecimal("10.00")),
        order("order-id-2", OrderStatus.CREATED, new BigDecimal("20.00"))
    );

    OrderPage expected = new OrderPage(expectedOrders, "nextToken");

    when(repository.findAll(OrderStatus.CREATED, 20, null)).thenReturn(expected);

    // when
    OrderPage actual = service.listOrders(OrderStatus.CREATED, 20, null);

    // then
    assertEquals(expected, actual);
  }

  @Test
  void listOrders_throwsIllegalArgumentException_whenLimitIsNegative() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.listOrders(null, -1, null)
    );
  }

  @Test
  void listOrders_throwsIllegalArgumentException_whenLimitIsZero() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.listOrders(null, 0, null)
    );
  }

  @Test
  void listOrders_throwsIllegalArgumentException_whenLimitIsGreaterThan100() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.listOrders(null, 101, null)
    );
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
