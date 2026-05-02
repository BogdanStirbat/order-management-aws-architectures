package com.order.management.lambdaaurora;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.order.management.lambdaaurora.config.AppConfig;
import com.order.management.lambdaaurora.db.Database;
import com.order.management.lambdaaurora.repository.OrderRepository;
import com.order.management.lambdaaurora.service.OrderService;
import com.order.management.lambdaaurora.web.ApiResponse;
import com.order.management.lambdaaurora.web.Router;
import javax.sql.DataSource;

public class OrdersApiHandler implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

  private static final AppConfig appConfig = AppConfig.fromEnv();
  private static final DataSource dataSource = Database.createDataSource(appConfig);
  private static final OrderRepository repository = new OrderRepository(dataSource);
  private static final OrderService service = new OrderService(repository);
  private static final Router router = new Router(service);

  @Override
  public APIGatewayV2HTTPResponse handleRequest(APIGatewayV2HTTPEvent event, Context context) {

    try {
      return router.route(event, context);
    } catch (Exception ex) {
      context.getLogger().log("Unhandled error: " + ex.getMessage());
      return ApiResponse.error(500, "Internal server error");
    }
  }
}
