package com.order.management.ec2ami;

import com.order.management.ec2ami.enums.OrderStatus;
import com.order.management.ec2ami.service.OrderService;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.order.management.ec2ami.entity.Order;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import static org.assertj.core.api.Assertions.assertThat;

@AutoConfigureMockMvc
public class OrderApiIntegrationTest extends AbstractEc2amiApplicationTests {

  @Autowired
  private OrderService orderService;

  @Autowired
  private MockMvc mvc;

  @Autowired
  private JsonMapper jsonMapper;

  @Test
  void create_returnsCreatedResource() throws Exception {

    // given && when && then
    var createResult = mvc.perform(post("/orders")
            .contentType("application/json")
            .content("""
                                {
                                  "totalAmount": 100.00
                                }
                                """))
        .andExpect(status().isCreated())
        .andExpect(header().exists("Location"))
        .andExpect(jsonPath("$.id").exists())
        .andReturn();

    String responseBody = createResult.getResponse().getContentAsString();

    Order createdOrder = jsonMapper.readValue(responseBody, Order.class);
    assertThat(createdOrder.getId()).isNotNull();
    assertThat(createdOrder.getVersion()).isEqualTo(0L);
    assertThat(createdOrder.getStatus()).isEqualTo(OrderStatus.CREATED);
    assertThat(createdOrder.getTotalAmount()).isEqualTo(new BigDecimal("100.00"));
    assertThat(createdOrder.getCreatedAt()).isNotNull();
    assertThat(createdOrder.getUpdatedAt()).isNotNull();
  }

  @Test
  void create_invalidRequest_returns400() throws Exception {

    // given && when && then
    mvc.perform(post("/orders")
            .contentType("application/json")
            .content("{}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void get_returnsResource_whenExists() throws Exception {

    // given
    Order order = orderService.createOrder(new BigDecimal("100"));

    // when & then
    mvc.perform(get("/orders/" + order.getId()))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.id").value(order.getId()))
        .andExpect(jsonPath("$.status").value("CREATED"))
        .andExpect(jsonPath("$.totalAmount").value(100.00))
        .andExpect(jsonPath("$.createdAt").exists())
        .andExpect(jsonPath("$.updatedAt").exists());
  }

  @Test
  void get_returns404_whenNotExists() throws Exception {

    // when & then
    mvc.perform(get("/orders/9999"))
        .andExpect(status().isNotFound());
  }

  @Test
  void cancel_returnsCancelledResource_andPersistsChange() throws Exception {

    // given
    Order order = orderService.createOrder(new BigDecimal("100.00"));
    Long id = order.getId();

    // when & then: call cancel endpoint
    mvc.perform(put("/orders/" + id + "/cancel"))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.id").value(id))
        .andExpect(jsonPath("$.status").value("CANCELLED"))
        .andExpect(jsonPath("$.totalAmount").value(100.00))
        .andExpect(jsonPath("$.createdAt").exists())
        .andExpect(jsonPath("$.updatedAt").exists());

    // and: verify persisted state via GET
    mvc.perform(get("/orders/" + id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(id))
        .andExpect(jsonPath("$.status").value("CANCELLED"));
  }

  @Test
  void cancel_isIdempotent_secondCallStillReturns200_andCancelled() throws Exception {

    // given
    Order order = orderService.createOrder(new BigDecimal("100.00"));
    Long id = order.getId();

    // when
    mvc.perform(put("/orders/" + id + "/cancel"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CANCELLED"));

    // then
    mvc.perform(put("/orders/" + id + "/cancel"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(id))
        .andExpect(jsonPath("$.status").value("CANCELLED"));
  }

  @Test
  void cancel_returns404_whenNotExists() throws Exception {

    // when & then
    mvc.perform(put("/orders/9999/cancel"))
        .andExpect(status().isNotFound());
  }

  @Test
  void listOrders_withoutPagingParams_usesDefaultSize20_andSortById() throws Exception {

    // given
    // create 21 orders to prove default page size is 20
    for (int i = 0; i < 21; i++) {
      orderService.createOrder(new BigDecimal("10.00"));
    }

    // when && then
    mvc.perform(get("/orders"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(20))
        .andExpect(jsonPath("$.size").value(20))
        .andExpect(jsonPath("$.number").value(0));
  }

  @Test
  void listOrders_withStatus_usesDefaultSize20() throws Exception {

    // given
    Order o1 = orderService.createOrder(new BigDecimal("100.00"));
    Order o2 = orderService.createOrder(new BigDecimal("50.00"));

    mvc.perform(put("/orders/" + o2.getId() + "/cancel"))
        .andExpect(status().isOk());

    // when && then
    mvc.perform(get("/orders").param("status", "CANCELLED"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(1))
        .andExpect(jsonPath("$.content[0].id").value(o2.getId()))
        .andExpect(jsonPath("$.content[0].status").value("CANCELLED"))
        .andExpect(jsonPath("$.size").value(20))
        .andExpect(jsonPath("$.number").value(0));
  }

  @Test
  void listOrders_sortedByIdAscending() throws Exception {

    // given
    Order o1 = orderService.createOrder(new BigDecimal("10.00"));
    Order o2 = orderService.createOrder(new BigDecimal("20.00"));
    Order o3 = orderService.createOrder(new BigDecimal("30.00"));

    // when
    var result = mvc.perform(get("/orders"))
        .andExpect(status().isOk())
        .andReturn();

    // then
    String json = result.getResponse().getContentAsString();

    List<Long> ids =
        jsonMapper.readTree(json)
            .path("content")
            .findValues("id")
            .stream()
            .map(JsonNode::asLong)
            .toList();

    assertThat(ids)
        .hasSize(3)
        .isSorted();
  }

}
