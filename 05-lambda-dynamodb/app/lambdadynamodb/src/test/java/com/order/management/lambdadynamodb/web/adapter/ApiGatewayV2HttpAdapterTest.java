package com.order.management.lambdadynamodb.web.adapter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.order.management.lambdadynamodb.web.dto.http.HttpRequest;
import com.order.management.lambdadynamodb.web.dto.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;

public class ApiGatewayV2HttpAdapterTest {

  private final ApiGatewayV2HttpAdapter adapter = new ApiGatewayV2HttpAdapter();

  @Test
  void toHttpRequest_mapsMethodPathQueryAndBody_whenInvoked() {

    // given
    APIGatewayV2HTTPEvent event = request("GET", "/orders");
    event.setQueryStringParameters(Map.of(
        "status", "CREATED",
        "page", "2"
    ));
    event.setBody("hello");

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals("GET", request.method());
    assertEquals("/orders", request.path());
    assertEquals(Map.of("status", "CREATED", "page", "2"), request.query());
    assertEquals("hello", request.body());
  }

  @Test
  void toHttpRequest_usesRawPath_whenAvailable() {

    // given
    APIGatewayV2HTTPEvent event = request("GET", "/request-context-path");
    event.setRawPath("/raw-path");

    // wen
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals("/raw-path", request.path());
  }

  @Test
  void toHttpRequest_fallsBackToRequestContextHttpPath_whenRawPathIsMissing() {

    // given
    APIGatewayV2HTTPEvent event = request("GET", "/request-context-path");
    event.setRawPath(null);

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals("/request-context-path", request.path());
  }

  @Test
  void toHttpRequest_usesRootPath_whenRawPathAndRequestContextPathAreMissing() {

    // given
    APIGatewayV2HTTPEvent event = request("GET", "/orders");
    event.setRawPath(null);
    event.getRequestContext().getHttp().setPath(null);

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals("/", request.path());
  }

  @Test
  void toHttpRequest_usesRootPath_whenRawPathAndRequestContextPathAreBlank() {

    // given
    APIGatewayV2HTTPEvent event = request("GET", "/orders");
    event.setRawPath("   ");
    event.getRequestContext().getHttp().setPath("   ");

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals("/", request.path());
  }

  @Test
  void toHttpRequest_returnsNullMethod_whenRequestContextIsMissing() {

    // given
    APIGatewayV2HTTPEvent event = new APIGatewayV2HTTPEvent();
    event.setRawPath("/orders");

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertNull(request.method());
    assertEquals("/orders", request.path());
  }

  @Test
  void toHttpRequest_returnsNullMethod_whenHttpContextIsMissing() {

    // given
    APIGatewayV2HTTPEvent event = new APIGatewayV2HTTPEvent();

    APIGatewayV2HTTPEvent.RequestContext requestContext =
        new APIGatewayV2HTTPEvent.RequestContext();

    event.setRequestContext(requestContext);
    event.setRawPath("/orders");

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertNull(request.method());
    assertEquals("/orders", request.path());
  }

  @Test
  void toHttpRequest_mapsNullQueryStringParametersToEmptyMap_whenNullQueryStrings() {

    // given
    APIGatewayV2HTTPEvent event = request("GET", "/orders");
    event.setQueryStringParameters(null);

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals(Map.of(), request.query());
  }

  @Test
  void toHttpRequest_extractsQueryStringParameters_whenInvoked() {

    // given
    APIGatewayV2HTTPEvent event = request("GET", "/orders");

    Map<String, String> query = new java.util.HashMap<>();
    query.put("page", "1");

    event.setQueryStringParameters(query);

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals("1", request.query().get("page"));
  }

  @Test
  void toHttpRequest_returnsNullBody_whenBodyIsMissing() {

    // given
    APIGatewayV2HTTPEvent event = request("POST", "/orders");
    event.setBody(null);

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertNull(request.body());
  }

  @Test
  void toHttpRequest_returnsPlainBody_whenBodyIsNotBase64Encoded() {

    // given
    APIGatewayV2HTTPEvent event = request("POST", "/orders");
    event.setBody("""
        {
          "totalAmount": 49.99
        }
        """);
    event.setIsBase64Encoded(false);

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertTrue(request.body().contains("\"totalAmount\": 49.99"));
  }

  @Test
  void toHttpRequest_decodesBase64Body_whenBase64EncodedIsTrue() {

    // given
    String body = """
        {
          "totalAmount": 49.99
        }
        """;

    APIGatewayV2HTTPEvent event = request("POST", "/orders");
    event.setBody(Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8)));
    event.setIsBase64Encoded(true);

    // when
    HttpRequest request = adapter.toHttpRequest(event);

    // then
    assertEquals(body, request.body());
  }

  @Test
  void toHttpRequest_throwsIllegalArgumentException_whenBase64BodyIsInvalid() {

    // given
    APIGatewayV2HTTPEvent event = request("POST", "/orders");
    event.setBody("not-valid-base64");
    event.setIsBase64Encoded(true);

    // when && then
    IllegalArgumentException ex = assertThrows(
        IllegalArgumentException.class,
        () -> adapter.toHttpRequest(event)
    );

    assertEquals("Invalid Base64-encoded request body", ex.getMessage());
  }

  @Test
  void toHttpRequest_throwsIllegalArgumentException_whenEventIsNull() {

    // when && then
    IllegalArgumentException ex = assertThrows(
        IllegalArgumentException.class,
        () -> adapter.toHttpRequest(null)
    );

    assertEquals("Event is required", ex.getMessage());
  }

  @Test
  void toApiGatewayResponse_mapsStatusCodeHeadersAndJsonBody_whenInvoked() {

    // given
    HttpResponse httpResponse = new HttpResponse(
        201,
        Map.of(
            "id", 1,
            "status", "CREATED"
        ),
        Map.of(
            "Content-Type", "application/json",
            "Location", "/orders/1"
        )
    );

    // when
    APIGatewayV2HTTPResponse response = adapter.toApiGatewayResponse(httpResponse);

    // then
    assertEquals(201, response.getStatusCode());
    assertEquals("application/json", response.getHeaders().get("Content-Type"));
    assertEquals("/orders/1", response.getHeaders().get("Location"));
    assertTrue(response.getBody().contains("\"id\":1"));
    assertTrue(response.getBody().contains("\"status\":\"CREATED\""));
  }

  @Test
  void toApiGatewayResponse_mapsNullHeadersToEmptyMap_whenNullHeaders() {

    // given
    HttpResponse httpResponse = new HttpResponse(
        200,
        Map.of("ok", true),
        null
    );

    // when
    APIGatewayV2HTTPResponse response = adapter.toApiGatewayResponse(httpResponse);

    // then
    assertEquals(200, response.getStatusCode());
    assertEquals(Map.of(), response.getHeaders());
    assertTrue(response.getBody().contains("\"ok\":true"));
  }

  @Test
  void toApiGatewayResponse_leavesBodyNull_whenHttpResponseBodyIsNull() {

    // given
    HttpResponse httpResponse = new HttpResponse(
        204,
        null,
        Map.of("Cache-Control", "no-store")
    );

    // when
    APIGatewayV2HTTPResponse response = adapter.toApiGatewayResponse(httpResponse);

    // then
    assertEquals(204, response.getStatusCode());
    assertEquals("no-store", response.getHeaders().get("Cache-Control"));
    assertNull(response.getBody());
  }

  @Test
  void toApiGatewayResponse_serializesStringBodyAsJsonString_whenInvoked() {

    // given
    HttpResponse httpResponse = new HttpResponse(
        200,
        "hello",
        Map.of("Content-Type", "application/json")
    );

    // when
    APIGatewayV2HTTPResponse response = adapter.toApiGatewayResponse(httpResponse);

    // then
    assertEquals(200, response.getStatusCode());
    assertEquals("\"hello\"", response.getBody());
  }

  private static APIGatewayV2HTTPEvent request(String method, String path) {
    APIGatewayV2HTTPEvent event = new APIGatewayV2HTTPEvent();

    APIGatewayV2HTTPEvent.RequestContext requestContext =
        new APIGatewayV2HTTPEvent.RequestContext();

    APIGatewayV2HTTPEvent.RequestContext.Http http =
        new APIGatewayV2HTTPEvent.RequestContext.Http();

    http.setMethod(method);
    http.setPath(path);

    requestContext.setHttp(http);

    event.setRequestContext(requestContext);
    event.setRawPath(path);

    return event;
  }
}
