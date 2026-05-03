package com.order.management.lambdaaurora;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.order.management.lambdaaurora.web.ApiResponse;
import com.order.management.lambdaaurora.web.Router;
import com.order.management.lambdaaurora.web.RouterFactory;
import com.order.management.lambdaaurora.web.adapter.ApiGatewayV2HttpAdapter;
import com.order.management.lambdaaurora.web.dto.http.HttpRequest;
import com.order.management.lambdaaurora.web.dto.http.HttpResponse;

public class OrdersApiHandler implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

  private final Router router = RouterFactory.create();
  private final ApiGatewayV2HttpAdapter adapter = new ApiGatewayV2HttpAdapter();

  @Override
  public APIGatewayV2HTTPResponse handleRequest(APIGatewayV2HTTPEvent event, Context context) {

    try {
      HttpRequest request = adapter.toHttpRequest(event);
      HttpResponse response = router.route(request);

      return adapter.toApiGatewayResponse(response);

    } catch (IllegalArgumentException ex) {
      return adapter.toApiGatewayResponse(ApiResponse.error(400, ex.getMessage()));

    } catch (Exception ex) {
      if (context != null && context.getLogger() != null) {
        context.getLogger().log("Unhandled error: " + ex.getMessage());
      }

      return adapter.toApiGatewayResponse(ApiResponse.error(500, "Internal server error"));
    }
  }
}
