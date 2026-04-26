package com.order.management.lambdaaurora;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.order.management.lambdaaurora.db.Database;
import com.order.management.lambdaaurora.repository.OrderRepository;
import com.order.management.lambdaaurora.service.OrderService;
import com.order.management.lambdaaurora.web.ApiResponse;
import com.order.management.lambdaaurora.web.Router;

public class OrdersApiHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

  private static final OrderRepository repository = new OrderRepository(Database.dataSource());
  private static final OrderService service = new OrderService(repository);
  private static final Router router = new Router(service);

  @Override
  public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent event, Context context) {

    try {
      return router.route(event, context);
    } catch (Exception ex) {
      context.getLogger().log("Unhandled error: " + ex.getMessage());
      return ApiResponse.error(500, "Internal server error");
    }
  }
}
