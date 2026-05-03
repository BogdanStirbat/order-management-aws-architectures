package com.order.management.lambdaaurora;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.order.management.lambdaaurora.web.ApiResponse;
import com.order.management.lambdaaurora.web.Router;
import com.order.management.lambdaaurora.web.adapter.ApiGatewayV2HttpAdapter;
import com.order.management.lambdaaurora.web.dto.http.HttpRequest;
import com.order.management.lambdaaurora.web.dto.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
public class OrdersApiHandlerTest {

  @Mock
  private Router router;

  @Mock
  private ApiGatewayV2HttpAdapter adapter;

  @InjectMocks
  private OrdersApiHandler ordersApiHandler;

  @Test
  void handleRequest_returnsResponse_whenInvoked() {

    // given
    APIGatewayV2HTTPEvent event = new APIGatewayV2HTTPEvent();
    Context context = mock(Context.class);

    HttpRequest httpRequest = new HttpRequest(
        "GET",
        "/orders",
        Map.of(),
        null
    );

    HttpResponse httpResponse = new HttpResponse(
        200,
        "[]",
        Map.of("Content-Type", "application/json")
    );

    APIGatewayV2HTTPResponse apiGatewayResponse = APIGatewayV2HTTPResponse.builder()
        .withStatusCode(200)
        .withHeaders(Map.of("Content-Type", "application/json"))
        .withBody("[]")
        .build();

    when(adapter.toHttpRequest(event)).thenReturn(httpRequest);
    when(router.route(httpRequest)).thenReturn(httpResponse);
    when(adapter.toApiGatewayResponse(httpResponse)).thenReturn(apiGatewayResponse);

    // when
    APIGatewayV2HTTPResponse response = ordersApiHandler.handleRequest(event, context);

    // then
    assertEquals(200, response.getStatusCode());
    assertEquals("[]", response.getBody());
    assertEquals("application/json", response.getHeaders().get("Content-Type"));
  }

  @Test
  void handleRequest_returns400_whenIllegalArgumentExceptionThrown() {

    // given
    APIGatewayV2HTTPEvent event = new APIGatewayV2HTTPEvent();
    Context context = mock(Context.class);

    APIGatewayV2HTTPResponse apiGatewayResponse = APIGatewayV2HTTPResponse.builder()
        .withStatusCode(400)
        .withHeaders(Map.of("Content-Type", "application/json"))
        .withBody("""
            {"message":"Invalid request"}
            """)
        .build();

    when(adapter.toHttpRequest(event))
        .thenThrow(new IllegalArgumentException("Invalid request"));

    when(adapter.toApiGatewayResponse(ApiResponse.error(400, "Invalid request")))
        .thenReturn(apiGatewayResponse);

    // when
    APIGatewayV2HTTPResponse response = ordersApiHandler.handleRequest(event, context);

    // then
    assertEquals(400, response.getStatusCode());
    assertEquals("""
        {"message":"Invalid request"}
        """, response.getBody());
  }

  @Test
  void handleRequest_returns500_whenUnexpectedExceptionThrown() {

    // given
    APIGatewayV2HTTPEvent event = new APIGatewayV2HTTPEvent();

    LambdaLogger logger = mock(LambdaLogger.class);
    Context context = mock(Context.class);
    when(context.getLogger()).thenReturn(logger);

    APIGatewayV2HTTPResponse apiGatewayResponse = APIGatewayV2HTTPResponse.builder()
        .withStatusCode(500)
        .withHeaders(Map.of("Content-Type", "application/json"))
        .withBody("""
            {"message":"Internal server error"}
            """)
        .build();

    when(adapter.toHttpRequest(event))
        .thenThrow(new RuntimeException("Something went wrong"));

    when(adapter.toApiGatewayResponse(ApiResponse.error(500, "Internal server error")))
        .thenReturn(apiGatewayResponse);

    // when
    APIGatewayV2HTTPResponse response = ordersApiHandler.handleRequest(event, context);

    // then
    assertEquals(500, response.getStatusCode());
    assertEquals("""
        {"message":"Internal server error"}
        """, response.getBody());
  }
}
