package com.order.management.lambdaaurora.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
public class OrderRepositoryIT {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>("postgres:16-alpine")
          .withDatabaseName("ordersdb")
          .withUsername("postgres")
          .withPassword("postgres");

  private OrderRepository repository;

  @BeforeEach
  void setUp() throws Exception {
    DataSource dataSource = createDataSource();

    try (Connection conn = dataSource.getConnection();
        Statement stmt = conn.createStatement()) {

      stmt.execute("DROP TABLE IF EXISTS orders");

      String migrationSql = new String(
          getClass()
              .getClassLoader()
              .getResourceAsStream("db/migration/create_orders_table.sql")
              .readAllBytes(),
          StandardCharsets.UTF_8
      );

      stmt.execute(migrationSql);
    }

    repository = new OrderRepository(dataSource);
  }

  @Test
  void create_createsOrder_whenInvoked() throws Exception {
    Order order = repository.create(new BigDecimal("49.99"));

    assertNotNull(order.id());
    assertEquals(0L, order.version());
    assertEquals(OrderStatus.CREATED, order.status());
    assertEquals(new BigDecimal("49.99"), order.totalAmount());
    assertNotNull(order.createdAt());
    assertNotNull(order.updatedAt());
  }

  @Test
  void findById_whenOrderExists_returnsOrder() throws Exception {
    Order created = repository.create(new BigDecimal("25.50"));

    Optional<Order> found = repository.findById(created.id());

    assertTrue(found.isPresent());
    assertEquals(created.id(), found.get().id());
    assertEquals(OrderStatus.CREATED, found.get().status());
    assertEquals(new BigDecimal("25.50"), found.get().totalAmount());
  }

  @Test
  void findById_whenOrderDoesNotExist_returnsEmpty() throws Exception {
    Optional<Order> found = repository.findById(999L);

    assertTrue(found.isEmpty());
  }

  @Test
  void cancel_whenOrderExists_updatesStatusVersionAndUpdatedAt() throws Exception {
    Order created = repository.create(new BigDecimal("100.00"));

    Thread.sleep(5); // tiny gap so updatedAt can move forward

    Order cancelled = repository.cancel(created.id());

    assertNotNull(cancelled);
    assertEquals(created.id(), cancelled.id());
    assertEquals(OrderStatus.CANCELLED, cancelled.status());
    assertEquals(1L, cancelled.version());
    assertTrue(!cancelled.updatedAt().isBefore(created.updatedAt()));
  }

  @Test
  void cancel_whenOrderDoesNotExist_returnsNull() throws Exception {
    Order cancelled = repository.cancel(999L);

    assertNull(cancelled);
  }

  @Test
  void findAll_withoutStatus_returnsPagedOrders() throws Exception {
    repository.create(new BigDecimal("10.00"));
    repository.create(new BigDecimal("20.00"));
    repository.create(new BigDecimal("30.00"));

    List<Order> page = repository.findAll(null, 2, 0);

    assertEquals(2, page.size());
    assertEquals(new BigDecimal("10.00"), page.get(0).totalAmount());
    assertEquals(new BigDecimal("20.00"), page.get(1).totalAmount());
  }

  @Test
  void findAll_withStatus_filtersOrders() throws Exception {
    Order first = repository.create(new BigDecimal("10.00"));
    Order second = repository.create(new BigDecimal("20.00"));

    repository.cancel(second.id());

    List<Order> createdOrders = repository.findAll(OrderStatus.CREATED, 10, 0);
    List<Order> cancelledOrders = repository.findAll(OrderStatus.CANCELLED, 10, 0);

    assertEquals(1, createdOrders.size());
    assertEquals(first.id(), createdOrders.getFirst().id());

    assertEquals(1, cancelledOrders.size());
    assertEquals(second.id(), cancelledOrders.getFirst().id());
  }

  private DataSource createDataSource() {
    PGSimpleDataSource ds = new PGSimpleDataSource();
    ds.setServerNames(new String[]{postgres.getHost()});
    ds.setPortNumbers(new int[]{postgres.getMappedPort(5432)});
    ds.setDatabaseName(postgres.getDatabaseName());
    ds.setUser(postgres.getUsername());
    ds.setPassword(postgres.getPassword());

    return ds;
  }
}
