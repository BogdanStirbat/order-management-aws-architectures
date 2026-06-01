package com.order.management.lambdadynamodb.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.order.management.lambdadynamodb.model.Order;
import com.order.management.lambdadynamodb.model.OrderStatus;
import com.order.management.lambdadynamodb.repository.exception.DatabaseException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.ReturnValue;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

public class OrderRepository {

  private static final String SK_META = "META";
  private static final String GSI1 = "GSI1";
  private static final String GSI2 = "GSI2";
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final DynamoDbClient dynamoDb;
  private final String tableName;

  public OrderRepository(DynamoDbClient dynamoDb, String tableName) {
    this.dynamoDb = dynamoDb;
    this.tableName = tableName;
  }

  public Order create(BigDecimal totalAmount) {
    Instant now = Instant.now();
    String id = UUID.randomUUID().toString();

    Map<String, AttributeValue> item = new HashMap<>();
    item.put("pk", s(orderPk(id)));
    item.put("sk", s(SK_META));

    item.put("gsi1pk", s(statusPk(OrderStatus.CREATED)));
    item.put("gsi1sk", s(createdAtSk(now, id)));

    item.put("gsi2pk", s("ORDERS"));
    item.put("gsi2sk", s(createdAtSk(now, id)));

    item.put("orderId", s(id));
    item.put("version", n(0));
    item.put("status", s(OrderStatus.CREATED.name()));
    item.put("totalAmount", s(totalAmount.toPlainString()));
    item.put("createdAt", s(now.toString()));
    item.put("updatedAt", s(now.toString()));

    try {
      dynamoDb.putItem(PutItemRequest.builder()
          .tableName(tableName)
          .item(item)
          .conditionExpression("attribute_not_exists(pk)")
          .build());

      return map(item);
    } catch (SdkException e) {
      throw new DatabaseException("Failed to create order", e);
    }
  }

  public Optional<Order> findById(String id) {
    try {
      Map<String, AttributeValue> item = dynamoDb.getItem(GetItemRequest.builder()
          .tableName(tableName)
          .key(orderKey(id))
          .consistentRead(true)
          .build()).item();

      if (item == null || item.isEmpty()) {
        return Optional.empty();
      }

      return Optional.of(map(item));
    } catch (SdkException e) {
      throw new DatabaseException("Failed to retrieve order by id", e);
    }
  }

  public Order cancel(String id) {
    Order existing = findById(id).orElse(null);
    if (existing == null) {
      return null;
    }

    if (existing.status() == OrderStatus.CANCELLED) {
      return existing;
    }

    Instant now = Instant.now();

    try {
      Map<String, AttributeValue> values = Map.of(
          ":cancelled", s(OrderStatus.CANCELLED.name()),
          ":created", s(OrderStatus.CREATED.name()),
          ":one", n(1),
          ":updatedAt", s(now.toString()),
          ":gsi1pk", s(statusPk(OrderStatus.CANCELLED)),
          ":gsi1sk", s(createdAtSk(existing.createdAt(), id))
      );

      Map<String, String> names = Map.of(
          "#status", "status",
          "#version", "version",
          "#updatedAt", "updatedAt",
          "#gsi1pk", "gsi1pk",
          "#gsi1sk", "gsi1sk"
      );

      Map<String, AttributeValue> updatedItem = dynamoDb.updateItem(UpdateItemRequest.builder()
          .tableName(tableName)
          .key(orderKey(id))
          .updateExpression("""
              SET #status = :cancelled,
                  #version = #version + :one,
                  #updatedAt = :updatedAt,
                  #gsi1pk = :gsi1pk,
                  #gsi1sk = :gsi1sk
              """)
          .conditionExpression("#status = :created")
          .expressionAttributeNames(names)
          .expressionAttributeValues(values)
          .returnValues(ReturnValue.ALL_NEW)
          .build()).attributes();

      return map(updatedItem);

    } catch (ConditionalCheckFailedException e) {
      return findById(id).orElse(null);
    } catch (SdkException e) {
      throw new DatabaseException("Failed to cancel order", e);
    }
  }

  public OrderPage findAll(OrderStatus status, int limit, String nextToken) {
    try {
      QueryRequest.Builder builder = QueryRequest.builder()
          .tableName(tableName)
          .limit(limit)
          .scanIndexForward(true);

      if (status == null) {
        builder.indexName(GSI2)
            .keyConditionExpression("gsi2pk = :pk")
            .expressionAttributeValues(Map.of(":pk", s("ORDERS")));
      } else {
        builder.indexName(GSI1)
            .keyConditionExpression("gsi1pk = :pk")
            .expressionAttributeValues(Map.of(":pk", s(statusPk(status))));
      }

      Map<String, AttributeValue> exclusiveStartKey = decodeNextToken(nextToken);
      if (exclusiveStartKey != null && !exclusiveStartKey.isEmpty()) {
        builder.exclusiveStartKey(exclusiveStartKey);
      }

      var response = dynamoDb.query(builder.build());

      List<Order> orders = response.items()
          .stream()
          .map(this::map)
          .toList();

      String newNextToken = encodeNextToken(response.lastEvaluatedKey());

      return new OrderPage(orders, newNextToken);
    } catch (SdkException e) {
      throw new DatabaseException("Failed to find orders", e);
    }
  }

  private Map<String, AttributeValue> orderKey(String id) {
    return Map.of(
        "pk", s(orderPk(id)),
        "sk", s(SK_META)
    );
  }

  private String orderPk(String id) {
    return "ORDER#" + id;
  }

  private String statusPk(OrderStatus status) {
    return "STATUS#" + status.name();
  }

  private String createdAtSk(Instant createdAt, String id) {
    return "CREATED_AT#" + createdAt + "#ORDER#" + id;
  }

  private AttributeValue s(String value) {
    return AttributeValue.fromS(value);
  }

  private AttributeValue n(long value) {
    return AttributeValue.fromN(Long.toString(value));
  }

  private Order map(Map<String, AttributeValue> item) {
    return new Order(
        item.get("orderId").s(),
        Long.parseLong(item.get("version").n()),
        OrderStatus.valueOf(item.get("status").s()),
        new BigDecimal(item.get("totalAmount").s()),
        Instant.parse(item.get("createdAt").s()),
        Instant.parse(item.get("updatedAt").s())
    );
  }

  private String encodeNextToken(Map<String, AttributeValue> lastEvaluatedKey) {
    if (lastEvaluatedKey == null || lastEvaluatedKey.isEmpty()) {
      return null;
    }

    try {
      Map<String, String> simpleKey = new HashMap<>();
      for (Map.Entry<String, AttributeValue> entry : lastEvaluatedKey.entrySet()) {
        AttributeValue value = entry.getValue();

        if (value.s() != null) {
          simpleKey.put(entry.getKey(), "S:" + value.s());
        } else if (value.n() != null) {
          simpleKey.put(entry.getKey(), "N:" + value.n());
        } else {
          throw new IllegalArgumentException("Unsupported key attribute type in nextToken");
        }
      }

      String json = MAPPER.writeValueAsString(simpleKey);

      return Base64.getUrlEncoder()
          .withoutPadding()
          .encodeToString(json.getBytes(StandardCharsets.UTF_8));
    } catch (Exception e) {
      throw new IllegalArgumentException("Failed to encode nextToken", e);
    }
  }

  private Map<String, AttributeValue> decodeNextToken(String nextToken) {
    if (nextToken == null || nextToken.isBlank()) {
      return null;
    }

    try {
      byte[] decoded = Base64.getUrlDecoder().decode(nextToken);
      String json = new String(decoded, StandardCharsets.UTF_8);

      Map<String, String> simpleKey = MAPPER.readValue(
          json,
          new TypeReference<Map<String, String>>() {}
      );

      Map<String, AttributeValue> result = new HashMap<>();

      for (Map.Entry<String, String> entry : simpleKey.entrySet()) {
        String value = entry.getValue();

        if (value.startsWith("S:")) {
          result.put(entry.getKey(), AttributeValue.fromS(value.substring(2)));
        } else if (value.startsWith("N:")) {
          result.put(entry.getKey(), AttributeValue.fromN(value.substring(2)));
        } else {
          throw new IllegalArgumentException("Invalid nextToken");
        }
      }

      return result;
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid nextToken");
    }
  }
}
