package com.order.management.lambdadynamodb.web;

import com.order.management.lambdadynamodb.config.AppConfig;
import com.order.management.lambdadynamodb.repository.OrderRepository;
import com.order.management.lambdadynamodb.service.OrderService;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

public class RouterFactory {

  private RouterFactory() {}

  public static Router create() {
    AppConfig appConfig = AppConfig.fromEnv();

    DynamoDbClient dynamoDbClient = DynamoDbClient.builder().build();

    OrderRepository repository = new OrderRepository(
        dynamoDbClient,
        appConfig.ordersTableName()
    );

    OrderService service = new OrderService(repository);

    return new Router(service);
  }
}
