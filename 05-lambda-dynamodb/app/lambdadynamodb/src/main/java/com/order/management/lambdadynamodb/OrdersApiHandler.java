package com.order.management.lambdadynamodb;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.order.management.lambdadynamodb.web.ApiResponse;
import com.order.management.lambdadynamodb.web.Router;
import com.order.management.lambdadynamodb.web.RouterFactory;
import com.order.management.lambdadynamodb.web.adapter.ApiGatewayV2HttpAdapter;
import com.order.management.lambdadynamodb.web.dto.http.HttpRequest;
import com.order.management.lambdadynamodb.web.dto.http.HttpResponse;
import java.io.PrintWriter;
import java.io.StringWriter;

public class OrdersApiHandler implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

  private final Router router;
  private final ApiGatewayV2HttpAdapter adapter;

  public OrdersApiHandler() {
    this(RouterFactory.create(), new ApiGatewayV2HttpAdapter());
  }

  OrdersApiHandler(Router router, ApiGatewayV2HttpAdapter adapter) {
    this.router = router;
    this.adapter = adapter;
  }

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
        context.getLogger().log(
            "Unhandled error requestId=" + context.getAwsRequestId() + "\n" + stackTraceToString(ex)
        );
      }

      return adapter.toApiGatewayResponse(ApiResponse.error(500, "Internal server error"));
    }
  }

  private static String stackTraceToString(Throwable throwable) {
    StringWriter sw = new StringWriter();
    throwable.printStackTrace(new PrintWriter(sw));
    return sw.toString();
  }
}
