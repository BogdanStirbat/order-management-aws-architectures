package com.order.management.lambdadynamodb.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.order.management.lambdadynamodb.model.Order;
import com.order.management.lambdadynamodb.model.OrderStatus;
import java.math.BigDecimal;
import java.net.URI;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.localstack.LocalStackContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition;
import software.amazon.awssdk.services.dynamodb.model.BillingMode;
import software.amazon.awssdk.services.dynamodb.model.CreateTableRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteTableRequest;
import software.amazon.awssdk.services.dynamodb.model.GlobalSecondaryIndex;
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement;
import software.amazon.awssdk.services.dynamodb.model.KeyType;
import software.amazon.awssdk.services.dynamodb.model.Projection;
import software.amazon.awssdk.services.dynamodb.model.ProjectionType;
import software.amazon.awssdk.services.dynamodb.model.ResourceNotFoundException;
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType;

@Testcontainers
public class OrderRepositoryIT {

  private static final String TABLE_NAME = "orders-test";

  @Container
  static final LocalStackContainer localStack =
      new LocalStackContainer(DockerImageName.parse("localstack/localstack:latest"))
          .withServices(LocalStackContainer.Service.DYNAMODB);

  private DynamoDbClient dynamoDb;
  private OrderRepository repository;

  @BeforeEach
  void setUp() {
    dynamoDb = createDynamoDbClient();

    deleteTableIfExists();
    createTable();

    repository = new OrderRepository(dynamoDb, TABLE_NAME);
  }

  @Test
  void create_createsOrder_whenInvoked() {

    // when
    Order order = repository.create(new BigDecimal("49.99"));

    // then
    assertNotNull(order.id());
    assertEquals(0L, order.version());
    assertEquals(OrderStatus.CREATED, order.status());
    assertEquals(new BigDecimal("49.99"), order.totalAmount());
    assertNotNull(order.createdAt());
    assertNotNull(order.updatedAt());
  }

  @Test
  void findById_whenOrderExists_returnsOrder() {

    // given
    Order created = repository.create(new BigDecimal("25.50"));

    // when
    Optional<Order> found = repository.findById(created.id());

    // then
    assertTrue(found.isPresent());
    assertEquals(created.id(), found.get().id());
    assertEquals(OrderStatus.CREATED, found.get().status());
    assertEquals(new BigDecimal("25.50"), found.get().totalAmount());
  }

  @Test
  void findById_whenOrderDoesNotExist_returnsEmpty() {

    // when
    Optional<Order> found = repository.findById("does-not-exist");

    // then
    assertTrue(found.isEmpty());
  }

  @Test
  void cancel_whenOrderInCreatedState_updatesStatusVersionAndUpdatedAt() throws Exception {

    // given
    Order created = repository.create(new BigDecimal("100.00"));

    Thread.sleep(5); // tiny gap so updatedAt can move forward

    // when
    Order cancelled = repository.cancel(created.id());

    // then
    assertNotNull(cancelled);
    assertEquals(created.id(), cancelled.id());
    assertEquals(OrderStatus.CANCELLED, cancelled.status());
    assertEquals(1L, cancelled.version());
    assertTrue(!cancelled.updatedAt().isBefore(created.updatedAt()));
  }

  @Test
  void cancel_whenOrderInCancelledState_keepsTheOrderUnchanged() throws Exception {

    // given
    Order created = repository.create(new BigDecimal("100.00"));
    Thread.sleep(5); // tiny gap so updatedAt can move forward

    Order firstCancelResponse = repository.cancel(created.id());
    Thread.sleep(5); // tiny gap so updatedAt can move forward

    // when
    Order secondCancelResponse = repository.cancel(created.id());

    // then
    assertEquals(firstCancelResponse, secondCancelResponse);
  }

  @Test
  void cancel_whenOrderDoesNotExist_returnsNull() {

    // when
    Order cancelled = repository.cancel("does-not-exist");

    // then
    assertNull(cancelled);
  }

  @Test
  void findAll_withoutStatus_returnsPagedOrders() throws Exception {

    // given
    repository.create(new BigDecimal("10.00"));
    Thread.sleep(5);
    repository.create(new BigDecimal("20.00"));
    Thread.sleep(5);
    repository.create(new BigDecimal("30.00"));

    // when
    OrderPage firstPage = repository.findAll(null, 2, null);

    // then
    assertEquals(2, firstPage.orders().size());
    assertNotNull(firstPage.nextToken());

    assertEquals(new BigDecimal("10.00"), firstPage.orders().get(0).totalAmount());
    assertEquals(new BigDecimal("20.00"), firstPage.orders().get(1).totalAmount());

    // when
    OrderPage secondPage = repository.findAll(null, 2, firstPage.nextToken());

    // then
    assertEquals(1, secondPage.orders().size());
    assertEquals(new BigDecimal("30.00"), secondPage.orders().get(0).totalAmount());
    assertNull(secondPage.nextToken());
  }

  @Test
  void findAll_withStatus_filtersOrders() {

    // given
    Order first = repository.create(new BigDecimal("10.00"));
    Order second = repository.create(new BigDecimal("20.00"));

    repository.cancel(second.id());

    // when
    OrderPage createdOrders = repository.findAll(OrderStatus.CREATED, 10, null);
    OrderPage cancelledOrders = repository.findAll(OrderStatus.CANCELLED, 10, null);

    // then
    assertEquals(1, createdOrders.orders().size());
    assertEquals(first.id(), createdOrders.orders().getFirst().id());

    assertEquals(1, cancelledOrders.orders().size());
    assertEquals(second.id(), cancelledOrders.orders().getFirst().id());
  }

  private DynamoDbClient createDynamoDbClient() {
    URI endpoint = localStack.getEndpointOverride(LocalStackContainer.Service.DYNAMODB);

    return DynamoDbClient.builder()
        .endpointOverride(endpoint)
        .region(Region.of(localStack.getRegion()))
        .credentialsProvider(StaticCredentialsProvider.create(
            AwsBasicCredentials.create(
                localStack.getAccessKey(),
                localStack.getSecretKey()
            )
        ))
        .build();
  }

  private void deleteTableIfExists() {
    try {
      dynamoDb.deleteTable(DeleteTableRequest.builder()
          .tableName(TABLE_NAME)
          .build());

      dynamoDb.waiter()
          .waitUntilTableNotExists(builder -> builder.tableName(TABLE_NAME));

    } catch (ResourceNotFoundException ignored) {
      // Table does not exist yet.
    }
  }

  private void createTable() {
    dynamoDb.createTable(CreateTableRequest.builder()
        .tableName(TABLE_NAME)
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .attributeDefinitions(
            AttributeDefinition.builder()
                .attributeName("pk")
                .attributeType(ScalarAttributeType.S)
                .build(),
            AttributeDefinition.builder()
                .attributeName("sk")
                .attributeType(ScalarAttributeType.S)
                .build(),
            AttributeDefinition.builder()
                .attributeName("gsi1pk")
                .attributeType(ScalarAttributeType.S)
                .build(),
            AttributeDefinition.builder()
                .attributeName("gsi1sk")
                .attributeType(ScalarAttributeType.S)
                .build(),
            AttributeDefinition.builder()
                .attributeName("gsi2pk")
                .attributeType(ScalarAttributeType.S)
                .build(),
            AttributeDefinition.builder()
                .attributeName("gsi2sk")
                .attributeType(ScalarAttributeType.S)
                .build()
        )
        .keySchema(
            KeySchemaElement.builder()
                .attributeName("pk")
                .keyType(KeyType.HASH)
                .build(),
            KeySchemaElement.builder()
                .attributeName("sk")
                .keyType(KeyType.RANGE)
                .build()
        )
        .globalSecondaryIndexes(
            globalSecondaryIndex("GSI1", "gsi1pk", "gsi1sk"),
            globalSecondaryIndex("GSI2", "gsi2pk", "gsi2sk")
        )
        .build());

    dynamoDb.waiter()
        .waitUntilTableExists(builder -> builder.tableName(TABLE_NAME));
  }

  private GlobalSecondaryIndex globalSecondaryIndex(
      String indexName,
      String partitionKey,
      String sortKey
  ) {
    return GlobalSecondaryIndex.builder()
        .indexName(indexName)
        .keySchema(
            KeySchemaElement.builder()
                .attributeName(partitionKey)
                .keyType(KeyType.HASH)
                .build(),
            KeySchemaElement.builder()
                .attributeName(sortKey)
                .keyType(KeyType.RANGE)
                .build()
        )
        .projection(Projection.builder()
            .projectionType(ProjectionType.ALL)
            .build())
        .build();
  }
}
