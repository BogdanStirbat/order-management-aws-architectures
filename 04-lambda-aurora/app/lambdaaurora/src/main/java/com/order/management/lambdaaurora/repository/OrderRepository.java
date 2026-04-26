package com.order.management.lambdaaurora.repository;

import com.order.management.lambdaaurora.model.Order;
import com.order.management.lambdaaurora.model.OrderStatus;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import javax.sql.DataSource;

public class OrderRepository {

  private final DataSource dataSource;

  public OrderRepository(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  public Order create(BigDecimal totalAmount) throws SQLException {
    String sql = """
        INSERT INTO orders(status, total_amount)
        VALUES (?, ?)
        RETURNING id, version, status, total_amount, created_at, updated_at
        """;

    try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {

      ps.setString(1, OrderStatus.CREATED.name());
      ps.setBigDecimal(2, totalAmount);

      try (ResultSet rs = ps.executeQuery()) {
        rs.next();
        return map(rs);
      }
    }
  }

  public Optional<Order> findById(long id) throws SQLException {
    String sql = """
        SELECT id, version, status, total_amount, created_at, updated_at
        FROM orders
        WHERE id = ?
        """;

    try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {

      ps.setLong(1, id);

      try (ResultSet rs = ps.executeQuery()) {
        if (!rs.next()) return Optional.empty();
        return Optional.of(map(rs));
      }
    }
  }

  public Order cancel(long id) throws SQLException {
    String sql = """
        UPDATE orders
        SET status = 'CANCELLED',
            version = version + 1,
            updated_at = now()
        WHERE id = ?
        RETURNING id, version, status, total_amount, created_at, updated_at
        """;

    try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {

      ps.setLong(1, id);

      try (ResultSet rs = ps.executeQuery()) {
        if (!rs.next()) return null;
        return map(rs);
      }
    }
  }

  public List<Order> findAll(OrderStatus status, int limit, int offset) throws SQLException {
    String sql = status == null
        ? """
          SELECT id, version, status, total_amount, created_at, updated_at
          FROM orders
          ORDER BY id ASC
          LIMIT ? OFFSET ?
          """
        : """
          SELECT id, version, status, total_amount, created_at, updated_at
          FROM orders
          WHERE status = ?
          ORDER BY id ASC
          LIMIT ? OFFSET ?
          """;

    try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {

      if (status != null) {
        ps.setString(1, status.name());
        ps.setInt(2, limit);
        ps.setInt(3, offset);
      } else {
        ps.setInt(1, limit);
        ps.setInt(2, offset);
      }

      try (ResultSet rs = ps.executeQuery()) {
        List<Order> orders = new ArrayList<>();
        while (rs.next()) {
          orders.add(map(rs));
        }
        return orders;
      }
    }
  }

  private Order map(ResultSet rs) throws SQLException {

    return new Order(
        rs.getLong("id"),
        rs.getLong("version"),
        OrderStatus.valueOf(rs.getString("status")),
        rs.getBigDecimal("total_amount"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant()
    );
  }
}
