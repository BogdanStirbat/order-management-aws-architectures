package com.order.management.lambdadynamodb.web;

import com.order.management.lambdadynamodb.web.dto.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;

public class ApiResponse {

  private ApiResponse() {}

  public static HttpResponse json(int statusCode, Object body) {
    return json(statusCode, body, Map.of());
  }

  public static HttpResponse json(
      int statusCode,
      Object body,
      Map<String, String> extraHeaders
  ) {
    try {
      Map<String, String> headers = new HashMap<>();
      headers.put("Content-Type", "application/json");
      headers.put("Cache-Control", "no-store");

      if (extraHeaders != null) {
        headers.putAll(extraHeaders);
      }

      return new HttpResponse(statusCode, body, headers);

    } catch (Exception ex) {
      return error(500, "Failed to serialize response");
    }
  }

  public static HttpResponse error(int statusCode, String message) {
    return json(statusCode, Map.of("message", message));
  }
}
