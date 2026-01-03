package com.order.management.ec2ami.web;

import com.order.management.ec2ami.entity.Order;
import com.order.management.ec2ami.enums.OrderStatus;
import com.order.management.ec2ami.service.OrderService;
import com.order.management.ec2ami.service.exception.OrderNotFoundException;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
        ArgumentMatchers.eq(new BigDecimal("100.00")))
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

}
