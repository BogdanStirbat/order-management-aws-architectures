package com.order.management.ec2ami.repository;

import com.order.management.ec2ami.TestcontainersConfiguration;
import com.order.management.ec2ami.entity.Order;
import com.order.management.ec2ami.enums.OrderStatus;
import java.math.BigDecimal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class OrderRepositoryTest {

  @Autowired
  private OrderRepository orderRepository;

  @AfterEach
  public void cleanUp() {
    orderRepository.deleteAll();
  }

  @Test
  void save_persistsOrder_andSetsAuditFields() {

    // given
    Order order = new Order();
    order.setStatus(OrderStatus.CREATED);
    order.setTotalAmount(new BigDecimal("100"));

    // when
    Order savedOrder = orderRepository.saveAndFlush(order);

    // then
    assertThat(savedOrder.getId()).isNotNull();
    assertThat(savedOrder.getStatus()).isEqualTo(OrderStatus.CREATED);
    assertThat(savedOrder.getTotalAmount()).isEqualByComparingTo("100");
    assertThat(savedOrder.getCreatedAt()).isNotNull();
    assertThat(savedOrder.getUpdatedAt()).isNotNull();
  }
}
