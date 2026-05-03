package com.order.management.lambdaaurora.web;

import com.order.management.lambdaaurora.config.AppConfig;
import com.order.management.lambdaaurora.db.Database;
import com.order.management.lambdaaurora.repository.OrderRepository;
import com.order.management.lambdaaurora.service.OrderService;
import javax.sql.DataSource;

public class RouterFactory {

  private RouterFactory() {}

  public static Router create() {
    AppConfig appConfig = AppConfig.fromEnv();
    DataSource dataSource = Database.createDataSource(appConfig);
    OrderRepository repository = new OrderRepository(dataSource);
    OrderService service = new OrderService(repository);

    return new Router(service);
  }
}
