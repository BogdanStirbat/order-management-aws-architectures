package com.order.management.lambdaaurora.web;

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.util.HashMap;
import java.util.Map;

public class ApiResponse {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .registerModule(new JavaTimeModule());

  private ApiResponse() {}

  public static APIGatewayProxyResponseEvent json(int statusCode, Object body) {
    return json(statusCode, body, Map.of());
  }

  public static APIGatewayProxyResponseEvent json(
      int statusCode,
      Object body,
      Map<String, String> extraHeaders
  ) {
    try {
      Map<String, String> headers = new HashMap<>();
      headers.put("Content-Type", "application/json");
      headers.put("Cache-Control", "no-store");
      headers.putAll(extraHeaders);

      return new APIGatewayProxyResponseEvent()
          .withStatusCode(statusCode)
          .withHeaders(headers)
          .withBody(MAPPER.writeValueAsString(body));

    } catch (Exception ex) {
      return error(500, "Failed to serialize response");
    }
  }

  public static APIGatewayProxyResponseEvent error(int statusCode, String message) {
    return json(statusCode, Map.of("message", message));
  }
}
