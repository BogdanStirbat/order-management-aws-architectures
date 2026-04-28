package com.order.management.lambdaaurora.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import com.order.management.lambdaaurora.repository.OrderRepository;
import com.order.management.lambdaaurora.service.exception.OrderNotFoundException;
import java.math.BigDecimal;
import java.sql.SQLException;
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
  void createOrder_createsOrder_whenTotalAmountIsPositive() throws SQLException {

    // given
    BigDecimal totalAmount = new BigDecimal("49.99");
    Order expected = order(1L, OrderStatus.CREATED, totalAmount);

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
  void getOrder_returnsOrder_whenOrderExists() throws SQLException {

    // given
    Order expected = order(1L, OrderStatus.CREATED, new BigDecimal("25.00"));

    when(repository.findById(1L)).thenReturn(Optional.of(expected));

    // when
    Order actual = service.getOrder(1L);

    // then
    assertEquals(expected, actual);
  }

  @Test
  void getOrder_throwsOrderNotFoundException_whenOrderDoesNotExist() throws SQLException {

    // given
    when(repository.findById(99L)).thenReturn(Optional.empty());

    // when && then
    assertThrows(
        OrderNotFoundException.class,
        () -> service.getOrder(99L)
    );
  }

  @Test
  void cancelOrder_returnsCancelledOrder_whenOrderExists() throws SQLException {

    // given
    Order cancelled = order(1L, OrderStatus.CANCELLED, new BigDecimal("100.00"));

    when(repository.cancel(1L)).thenReturn(cancelled);

    // when
    Order actual = service.cancelOrder(1L);

    // then
    assertEquals(cancelled, actual);
  }

  @Test
  void cancelOrder_throwsOrderNotFoundException_whenOrderDoesNotExist() throws SQLException {

    // given
    when(repository.cancel(99L)).thenReturn(null);

    // when && then
    assertThrows(
        OrderNotFoundException.class,
        () -> service.cancelOrder(99L)
    );
  }

  @Test
  void listOrders_returnsOrders_whenArgumentsAreValid() throws SQLException {

    // given
    List<Order> expected = List.of(
        order(1L, OrderStatus.CREATED, new BigDecimal("10.00")),
        order(2L, OrderStatus.CREATED, new BigDecimal("20.00"))
    );

    when(repository.findAll(OrderStatus.CREATED, 20, 40)).thenReturn(expected);

    // when
    List<Order> actual = service.listOrders(OrderStatus.CREATED, 2, 20);

    // then
    assertEquals(expected, actual);
  }

  @Test
  void listOrders_throwsIllegalArgumentException_whenPageIsNegative() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.listOrders(null, -1, 20)
    );
  }

  @Test
  void listOrders_throwsIllegalArgumentException_whenSizeIsZero() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.listOrders(null, 0, 0)
    );
  }

  @Test
  void listOrders_throwsIllegalArgumentException_whenSizeIsGreaterThan100() {

    // given && when && then
    assertThrows(
        IllegalArgumentException.class,
        () -> service.listOrders(null, 0, 101)
    );
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
