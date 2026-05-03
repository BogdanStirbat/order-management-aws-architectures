package com.order.management.lambdaaurora;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.order.management.lambdaaurora.config.AppConfig;
import com.order.management.lambdaaurora.db.Database;
import com.order.management.lambdaaurora.repository.OrderRepository;
import com.order.management.lambdaaurora.service.OrderService;
import com.order.management.lambdaaurora.web.ApiResponse;
import com.order.management.lambdaaurora.web.Router;
import com.order.management.lambdaaurora.web.dto.http.HttpRequest;
import com.order.management.lambdaaurora.web.dto.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import javax.sql.DataSource;

public class OrdersApiHandler implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .registerModule(new JavaTimeModule());

  private final Router router;

  public OrdersApiHandler() {
    this(createRouter());
  }

  OrdersApiHandler(Router router) {
    this.router = router;
  }

  private static Router createRouter() {
    AppConfig appConfig = AppConfig.fromEnv();
    DataSource dataSource = Database.createDataSource(appConfig);
    OrderRepository repository = new OrderRepository(dataSource);
    OrderService service = new OrderService(repository);

    return new Router(service);
  }

  @Override
  public APIGatewayV2HTTPResponse handleRequest(APIGatewayV2HTTPEvent event, Context context) {

    try {
      HttpRequest request = toHttpRequest(event);
      HttpResponse response = router.route(request);

      return toApiGatewayResponse(response);

    } catch (IllegalArgumentException ex) {
      return toApiGatewayResponse(ApiResponse.error(400, ex.getMessage()));

    } catch (Exception ex) {
      if (context != null && context.getLogger() != null) {
        context.getLogger().log("Unhandled error: " + ex.getMessage());
      }

      return toApiGatewayResponse(ApiResponse.error(500, "Internal server error"));
    }
  }

  private HttpRequest toHttpRequest(APIGatewayV2HTTPEvent event) {
    if (event == null) {
      throw new IllegalArgumentException("Event is required");
    }

    return new HttpRequest(
        methodOf(event),
        pathOf(event),
        queryOf(event),
        bodyOf(event)
    );
  }

  private String methodOf(APIGatewayV2HTTPEvent event) {
    if (event.getRequestContext() == null ||
        event.getRequestContext().getHttp() == null) {
      return null;
    }

    return event.getRequestContext().getHttp().getMethod();
  }

  private String pathOf(APIGatewayV2HTTPEvent event) {
    if (event.getRawPath() != null && !event.getRawPath().isBlank()) {
      return event.getRawPath();
    }

    if (event.getRequestContext() != null &&
        event.getRequestContext().getHttp() != null &&
        event.getRequestContext().getHttp().getPath() != null &&
        !event.getRequestContext().getHttp().getPath().isBlank()) {
      return event.getRequestContext().getHttp().getPath();
    }

    return "/";
  }

  private Map<String, String> queryOf(APIGatewayV2HTTPEvent event) {
    if (event.getQueryStringParameters() == null) {
      return Map.of();
    }

    return Map.copyOf(event.getQueryStringParameters());
  }

  private String bodyOf(APIGatewayV2HTTPEvent event) {
    String body = event.getBody();

    if (body == null) {
      return null;
    }

    if (event.getIsBase64Encoded()) {
      try {
        return new String(
            Base64.getDecoder().decode(body),
            StandardCharsets.UTF_8
        );
      } catch (IllegalArgumentException ex) {
        throw new IllegalArgumentException("Invalid Base64-encoded request body");
      }
    }

    return body;
  }

  private APIGatewayV2HTTPResponse toApiGatewayResponse(HttpResponse httpResponse) {
    APIGatewayV2HTTPResponse response = new APIGatewayV2HTTPResponse();

    response.setStatusCode(httpResponse.statusCode());
    response.setHeaders(httpResponse.headers() == null ? Map.of() : httpResponse.headers());

    try {
      if (httpResponse.body() != null) {
        response.setBody(MAPPER.writeValueAsString(httpResponse.body()));
      }

      return response;

    } catch (Exception ex) {
      APIGatewayV2HTTPResponse fallback = new APIGatewayV2HTTPResponse();

      fallback.setStatusCode(500);
      fallback.setHeaders(Map.of(
          "Content-Type", "application/json",
          "Cache-Control", "no-store"
      ));
      fallback.setBody("{\"message\":\"Failed to serialize response\"}");

      return fallback;
    }
  }
}
