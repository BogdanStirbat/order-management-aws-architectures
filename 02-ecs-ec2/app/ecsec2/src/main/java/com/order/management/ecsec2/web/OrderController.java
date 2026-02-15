package com.order.management.ecsec2.web;

import com.order.management.ecsec2.entity.Order;
import com.order.management.ecsec2.enums.OrderStatus;
import com.order.management.ecsec2.service.OrderService;
import com.order.management.ecsec2.web.dto.CreateOrderRequest;
import com.order.management.ecsec2.web.dto.OrderResponse;
import com.order.management.ecsec2.web.mapper.OrderMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springdoc.core.converters.models.PageableAsQueryParam;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@Tag(name = "Orders", description = "Operations related to orders")
@RestController
@RequestMapping("/orders")
public class OrderController {

  private final OrderService orderService;

  public OrderController(OrderService orderService) {
    this.orderService = orderService;
  }

  @PostMapping
  @Operation(
      summary = "Create an order",
      description = "Creates an order and returns the created resource plus a Location header."
  )
  @ApiResponses({
      @ApiResponse(
          responseCode = "201",
          description = "Order created",
          content = @Content(schema = @Schema(implementation = OrderResponse.class))
      ),
      @ApiResponse(responseCode = "400", description = "Validation error", content = @Content)
  })
  public ResponseEntity<OrderResponse> createOrder(
      @io.swagger.v3.oas.annotations.parameters.RequestBody(
          required = true,
          description = "Order creation payload",
          content = @Content(schema = @Schema(implementation = CreateOrderRequest.class))
      )
      @RequestBody @Valid CreateOrderRequest request,
      UriComponentsBuilder uriComponentsBuilder) {

    Order order = orderService.createOrder(request.totalAmount());

    return ResponseEntity.created(
        uriComponentsBuilder.path("/orders/{id}")
            .buildAndExpand(order.getId())
            .toUri()
    ).body(OrderMapper.toResponse(order));
  }

  @GetMapping("/{id}")
  @Operation(summary = "Get an order by id")
  @ApiResponses({
      @ApiResponse(
          responseCode = "200",
          description = "Order found",
          content = @Content(schema = @Schema(implementation = OrderResponse.class))
      ),
      @ApiResponse(responseCode = "404", description = "Order not found", content = @Content)
  })
  public ResponseEntity<OrderResponse> getOrder(
      @Parameter(description = "Order id", example = "123") @PathVariable Long id) {

    Order order = orderService.getOrder(id);

    return ResponseEntity.ok(OrderMapper.toResponse(order));
  }

  @PutMapping("/{id}/cancel")
  @Operation(
      summary = "Cancel an order",
      description = "Cancels an existing order by id"
  )
  @ApiResponses({
      @ApiResponse(
          responseCode = "200",
          description = "Order canceled successfully",
          content = @Content(
              mediaType = "application/json",
              schema = @Schema(implementation = OrderResponse.class),
              examples = @ExampleObject(
                  name = "CancelledOrder",
                  summary = "Cancelled order example",
                  value = """
                    {
                      "id": 1,
                      "status": "CANCELLED",
                      "totalAmount": 100.00,
                      "createdAt": "2025-01-01T10:00:00Z",
                      "updatedAt": "2025-01-01T10:05:00Z"
                    }
                    """
              )
          )
      ),
      @ApiResponse(responseCode = "404", description = "Order not found", content = @Content),
      @ApiResponse(responseCode = "409", description = "Order cannot be canceled in its current state", content = @Content)
  })
  public ResponseEntity<OrderResponse> cancelOrder(
      @Parameter(description = "Order id", example = "123")
      @PathVariable Long id) {

    Order canceledOrder = orderService.cancelOrder(id);

    return ResponseEntity.ok(OrderMapper.toResponse(canceledOrder));
  }

  @GetMapping
  @Operation(
      summary = "List orders",
      description = """
        Returns orders, optionally filtered by status.

        Defaults:
        - page=0
        - size=20
        - sort=id,asc
        """
  )
  @ApiResponses({
      @ApiResponse(
          responseCode = "200",
          description = "Page of orders returned"
      ),
      @ApiResponse(responseCode = "400", description = "Invalid query parameter", content = @Content)
  })
  @PageableAsQueryParam
  public ResponseEntity<Page<OrderResponse>> listOrders(
      @Parameter(
          description = "Optional status filter",
          schema = @Schema(implementation = OrderStatus.class),
          example = "CREATED"
      )
      @RequestParam(name = "status", required = false) OrderStatus status,

      @ParameterObject
      @PageableDefault(size = 20, sort = "id", direction = Sort.Direction.ASC)
      Pageable pageable
  ) {
    Page<OrderResponse> page = orderService.getOrders(status, pageable)
        .map(OrderMapper::toResponse);

    return ResponseEntity.ok(page);
  }
}
