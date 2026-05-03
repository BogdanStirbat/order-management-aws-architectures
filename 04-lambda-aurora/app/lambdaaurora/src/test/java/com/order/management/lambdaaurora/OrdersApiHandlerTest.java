package com.order.management.lambdaaurora;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.order.management.lambdaaurora.web.Router;
import com.order.management.lambdaaurora.web.dto.http.HttpRequest;
import com.order.management.lambdaaurora.web.dto.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

public class OrdersApiHandlerTest {

  @Test
  void handleRequest_createsHttpRequestFromApiGatewayEvent_whenInvoked() {

    // given
    Router router = mock(Router.class);

    when(router.route(any(HttpRequest.class)))
        .thenReturn(new HttpResponse(200, Map.of("ok", true), Map.of()));

    OrdersApiHandler handler = new OrdersApiHandler(router);

    APIGatewayV2HTTPEvent event = request("GET", "/orders");
    event.setQueryStringParameters(Map.of(
        "status", "CREATED",
        "page", "2"
    ));

    // when
    handler.handleRequest(event, mock(Context.class));

    // then
    ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
    verify(router).route(captor.capture());

    HttpRequest request = captor.getValue();
    assertEquals("GET", request.method());
    assertEquals("/orders", request.path());
    assertEquals(Map.of("status", "CREATED", "page", "2"), request.query());
    assertNull(request.body());
  }

  @Test
  void handleRequest_decodesBase64EncodedBody_whenRequestBodyIsEncoded() {

    // given
    Router router = mock(Router.class);

    when(router.route(any(HttpRequest.class)))
        .thenReturn(new HttpResponse(200, Map.of("ok", true), Map.of()));

    OrdersApiHandler handler = new OrdersApiHandler(router);

    String json = """
        {
          "totalAmount": 49.99
        }
        """;

    APIGatewayV2HTTPEvent event = request("POST", "/orders");
    event.setBody(Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8)));
    event.setIsBase64Encoded(true);

    // when
    handler.handleRequest(event, mock(Context.class));

    // then
    ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
    verify(router).route(captor.capture());
    assertEquals(json, captor.getValue().body());
  }

  @Test
  void handleRequest_serializesHttpResponseToApiGatewayResponse_whenInvoked() {

    // given
    Router router = mock(Router.class);

    when(router.route(any(HttpRequest.class)))
        .thenReturn(new HttpResponse(
            201,
            Map.of(
                "id", 1,
                "status", "CREATED"
            ),
            Map.of(
                "Content-Type", "application/json",
                "Location", "/orders/1"
            )
        ));

    OrdersApiHandler handler = new OrdersApiHandler(router);

    // when
    APIGatewayV2HTTPResponse response = handler.handleRequest(
        request("POST", "/orders"),
        mock(Context.class)
    );

    // then
    assertEquals(201, response.getStatusCode());
    assertEquals("application/json", response.getHeaders().get("Content-Type"));
    assertEquals("/orders/1", response.getHeaders().get("Location"));
    assertTrue(response.getBody().contains("\"id\":1"));
    assertTrue(response.getBody().contains("\"status\":\"CREATED\""));
  }

  @Test
  void handleRequest_handlesNullQueryStringParametersAsEmptyMap_whenNullQueryString() {

    // given
    Router router = mock(Router.class);

    when(router.route(any(HttpRequest.class)))
        .thenReturn(new HttpResponse(200, Map.of("ok", true), Map.of()));

    OrdersApiHandler handler = new OrdersApiHandler(router);

    APIGatewayV2HTTPEvent event = request("GET", "/orders");
    event.setQueryStringParameters(null);

    // when
    handler.handleRequest(event, mock(Context.class));

    // then
    ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
    verify(router).route(captor.capture());
    assertEquals(Map.of(), captor.getValue().query());
  }

  @Test
  void handleRequest_usesRequestContextPath_whenRawPathIsMissing() {

    // given
    Router router = mock(Router.class);

    when(router.route(any(HttpRequest.class)))
        .thenReturn(new HttpResponse(200, Map.of("ok", true), Map.of()));

    OrdersApiHandler handler = new OrdersApiHandler(router);

    APIGatewayV2HTTPEvent event = request("GET", "/orders/1");
    event.setRawPath(null);

    // when
    handler.handleRequest(event, mock(Context.class));

    // then
    ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
    verify(router).route(captor.capture());
    assertEquals("/orders/1", captor.getValue().path());
  }

  @Test
  void handleRequest_returns400_whenBodyIsInvalidBase64() {

    // given
    Router router = mock(Router.class);
    OrdersApiHandler handler = new OrdersApiHandler(router);

    APIGatewayV2HTTPEvent event = request("POST", "/orders");
    event.setBody("not-valid-base64");
    event.setIsBase64Encoded(true);

    // when
    APIGatewayV2HTTPResponse response = handler.handleRequest(event, mock(Context.class));

    // then
    assertEquals(400, response.getStatusCode());
    assertTrue(response.getBody().contains("Invalid Base64-encoded request body"));
    verifyNoInteractions(router);
  }

  @Test
  void handleRequest_returns500_whenRouterThrowsUnexpectedException() {

    // given
    Router router = mock(Router.class);

    when(router.route(any(HttpRequest.class)))
        .thenThrow(new RuntimeException("boom"));

    OrdersApiHandler handler = new OrdersApiHandler(router);

    LambdaLogger logger = mock(LambdaLogger.class);
    Context context = mock(Context.class);

    when(context.getLogger()).thenReturn(logger);

    // when
    APIGatewayV2HTTPResponse response = handler.handleRequest(
        request("GET", "/orders/1"),
        context
    );

    // then
    assertEquals(500, response.getStatusCode());
    assertTrue(response.getBody().contains("Internal server error"));
  }

  @Test
  void handleRequest_serializesNullHttpResponseBodyAsNullApiGatewayBody_whenNullHttpResponseBody() {

    // given
    Router router = mock(Router.class);

    when(router.route(any(HttpRequest.class)))
        .thenReturn(new HttpResponse(204, null, Map.of()));

    OrdersApiHandler handler = new OrdersApiHandler(router);

    // when
    APIGatewayV2HTTPResponse response = handler.handleRequest(
        request("GET", "/orders"),
        mock(Context.class)
    );

    // then
    assertEquals(204, response.getStatusCode());
    assertNull(response.getBody());
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
