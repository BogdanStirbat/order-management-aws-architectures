package com.order.management.lambdaaurora.web.adapter;

import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.order.management.lambdaaurora.web.dto.http.HttpRequest;
import com.order.management.lambdaaurora.web.dto.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

public class ApiGatewayV2HttpAdapter {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .registerModule(new JavaTimeModule());

  public HttpRequest toHttpRequest(APIGatewayV2HTTPEvent event) {
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

  public APIGatewayV2HTTPResponse toApiGatewayResponse(HttpResponse httpResponse) {
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
}
