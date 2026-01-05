package com.order.management.ec2ami.web;

import com.order.management.ec2ami.entity.Order;
import com.order.management.ec2ami.enums.OrderStatus;
import com.order.management.ec2ami.service.OrderService;
import com.order.management.ec2ami.service.exception.OrderNotFoundException;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

@WebMvcTest(OrderController.class)
class OrderControllerWebMvcTest {

  @Autowired
  private MockMvc mvc;

  @MockitoBean
  private OrderService orderService;

  @Test
  void postOrders_returns201_withLocation_andBody() throws Exception {

    // given
    Order order = new Order();
    order.setId(1L);
    order.setStatus(OrderStatus.CREATED);
    order.setTotalAmount(new BigDecimal("100"));

    when(orderService.createOrder(
        eq(new BigDecimal("100.00")))
    ).thenReturn(order);

    // when && then
    mvc.perform(post("/orders")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                                {
                                  "status": "CREATED",
                                  "totalAmount": 100.00
                                }
                                """))
        .andExpect(status().isCreated())
        .andExpect(header().string("Location", "http://localhost/orders/1"))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.id").value(1))
        .andExpect(jsonPath("$.status").value("CREATED"))
        .andExpect(jsonPath("$.totalAmount").value(100.00));
  }

  @Test
  void postOrders_invalidRequest_returns400() throws Exception {

    // given && when && then
    mvc.perform(post("/orders")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void getOrder_found_returns200() throws Exception {

    // given
    Order order = new Order();
    order.setId(1L);
    order.setStatus(OrderStatus.CREATED);
    order.setTotalAmount(new BigDecimal("100"));

    when(orderService.getOrder(1L)).thenReturn(order);

    // when && then
    mvc.perform(get("/orders/1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(1))
        .andExpect(jsonPath("$.status").value("CREATED"))
        .andExpect(jsonPath("$.totalAmount").value(100.00));
  }

  @Test
  void getOrder_notFound_returns404() throws Exception {

    // given
    when(orderService.getOrder(999L)).thenThrow(new OrderNotFoundException(999L));

    // when && then
    mvc.perform(get("/orders/999"))
        .andExpect(status().isNotFound());
  }

  @Test
  void putCancel_createdOrder_returns200_withCancelledBody() throws Exception {

    // given
    Order cancelled = new Order();
    cancelled.setId(1L);
    cancelled.setStatus(OrderStatus.CANCELLED);
    cancelled.setTotalAmount(new BigDecimal("100"));

    when(orderService.cancelOrder(1L)).thenReturn(cancelled);

    // when && then
    mvc.perform(put("/orders/1/cancel"))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.id").value(1))
        .andExpect(jsonPath("$.status").value("CANCELLED"))
        .andExpect(jsonPath("$.totalAmount").value(100.00));
  }

  @Test
  void putCancel_alreadyCancelled_returns200_idempotent() throws Exception {

    // given
    Order alreadyCancelled = new Order();
    alreadyCancelled.setId(1L);
    alreadyCancelled.setStatus(OrderStatus.CANCELLED);
    alreadyCancelled.setTotalAmount(new BigDecimal("100"));

    when(orderService.cancelOrder(1L)).thenReturn(alreadyCancelled);

    // when && then
    mvc.perform(put("/orders/1/cancel"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(1))
        .andExpect(jsonPath("$.status").value("CANCELLED"))
        .andExpect(jsonPath("$.totalAmount").value(100.00));
  }

  @Test
  void putCancel_notFound_returns404() throws Exception {

    // given
    when(orderService.cancelOrder(999L)).thenThrow(new OrderNotFoundException(999L));

    // when && then
    mvc.perform(put("/orders/999/cancel"))
        .andExpect(status().isNotFound());
  }

  @Test
  void getOrders_withoutParams_usesDefaultPagingAndSorting() throws Exception {

    // given
    Order o1 = new Order();
    o1.setId(1L);
    o1.setStatus(OrderStatus.CREATED);
    o1.setTotalAmount(new BigDecimal("100.00"));

    when(orderService.getOrders(eq(null), any(Pageable.class)))
        .thenReturn(new PageImpl<>(List.of(o1), PageRequest.of(0, 20, Sort.by("id").ascending()), 1));

    // when && then
    mvc.perform(get("/orders"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(1))
        .andExpect(jsonPath("$.content[0].id").value(1))
        .andExpect(jsonPath("$.content[0].status").value("CREATED"));

    // verify default pageable passed to service
    var pageableCaptor = org.mockito.ArgumentCaptor.forClass(Pageable.class);
    verify(orderService).getOrders(eq(null), pageableCaptor.capture());

    Pageable p = pageableCaptor.getValue();
    assertThat(p.getPageNumber()).isEqualTo(0);
    assertThat(p.getPageSize()).isEqualTo(20);
    assertThat(p.getSort().getOrderFor("id").getDirection()).isEqualTo(Sort.Direction.ASC);
  }

  @Test
  void getOrders_withStatus_usesDefaultPagingAndSorting() throws Exception {

    // given
    Order o1 = new Order();
    o1.setId(2L);
    o1.setStatus(OrderStatus.CANCELLED);
    o1.setTotalAmount(new BigDecimal("50.00"));

    when(orderService.getOrders(eq(OrderStatus.CANCELLED), any(Pageable.class)))
        .thenReturn(new PageImpl<>(List.of(o1), PageRequest.of(0, 20, Sort.by("id").ascending()), 1));

    // when && then
    mvc.perform(get("/orders").param("status", "CANCELLED"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(1))
        .andExpect(jsonPath("$.content[0].id").value(2))
        .andExpect(jsonPath("$.content[0].status").value("CANCELLED"));
  }

  @Test
  void getOrders_withInvalidStatus_returns400() throws Exception {

    // given && when && then
    mvc.perform(get("/orders").param("status", "BOGUS"))
        .andExpect(status().isBadRequest());
  }
}
