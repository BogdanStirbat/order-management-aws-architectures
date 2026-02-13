# Request flow and application behavior

This document describes how a request flows through the Orders App, from the
external client to the database and back, and how the application behaves at
each step.

The goal is to make the **runtime behavior** of the system clear without
requiring readers to inspect the application source code.

---

## High-level request flow

A typical API request follows this path:

1. Client sends an HTTPS request to **API Gateway**
2. API Gateway forwards the request through a **VPC Link**
3. The VPC Link routes traffic to an **internal Application Load Balancer**
4. The ALB forwards the request to a healthy **EC2 application instance**
5. The Spring Boot application processes the request
6. The application reads from or writes to **RDS PostgreSQL**
7. The response is returned to the client via the same path

Once traffic enters the VPC, it remains entirely within the private network.

---

## Request flow diagram

![Request Flow](diagrams/architecture.png)

---

## Client interaction

### Authentication

- Clients authenticate against **Amazon Cognito User Pools**.
- Cognito issues **JWT access tokens**.
- Clients include the token in the `Authorization` header:
```
Authorization: Bearer <jwt>
```


### Request format

- All API requests use JSON over HTTP.
- API definitions are documented via **OpenAPI / Swagger**.

---

## API Gateway behavior

### Public entrypoint

- API Gateway terminates public HTTPS traffic.
- It serves as the only internet-facing component.

### VPC Link integration

- API Gateway uses a **VPC Link** to forward traffic to the VPC.
- VPC Link creates managed ENIs in the VPC.
- Requests are forwarded to the ALB listener.

This allows the ALB to remain internal while still being reachable from the
internet.

---

## Load balancing and routing

### Application Load Balancer

- The ALB listens on port **80**.
- Requests are routed to the target group based on health checks.
- Only healthy instances receive traffic.

### Health checks

- Health check endpoint: `/actuator/health`
- Provided by Spring Boot Actuator
- Health details are intentionally minimal

Unhealthy instances are removed from rotation automatically.

---

## Application behavior

### Spring Boot runtime

Each EC2 instance runs:

- A single Spring Boot application
- Managed by **systemd**
- Configured via environment variables

### Startup behavior

At startup, the application:

1. Reads environment variables from `/etc/orders-app.env`
2. Initializes database connectivity
3. Runs Flyway database migrations (if required)
4. Exposes REST endpoints

If startup fails, the instance is marked unhealthy and replaced.

---

## Authentication and authorization (application layer)

### JWT validation

The Spring Boot application acts as an **OAuth2 Resource Server**:

- Validates the JWT issuer (`iss`)
- Validates the audience (`aud`)
- Verifies token signature using Cognito public keys

Only requests with valid tokens are allowed to reach controllers.

### Authorization

- Endpoint-level access control is enforced by Spring Security configuration
- The application currently assumes a single role / trust domain
- Authorization rules can be extended as needed

---

## Request handling inside the application

### Controller layer

- Requests are handled by REST controllers (e.g. `OrderController`)
- Input validation is performed using:
    - Bean Validation (`@Valid`)
    - Enum constraints (e.g. order status)

Invalid requests result in `400 Bad Request` responses.

---

### Service layer

- Business logic is implemented in service classes
- Examples:
    - Creating an order
    - Canceling an order
    - Fetching paginated results

Business rule violations (e.g. canceling an already canceled order) result in
appropriate error responses.

---

### Persistence layer

- Uses **Spring Data JPA**
- Database schema is managed by **Flyway**
- Hibernate is configured with `ddl-auto=validate`

This ensures:
- Schema and entities remain aligned
- Runtime schema changes are prevented

---

## Database interaction

### Connection handling

- Database connections are created using JDBC
- Connection details are injected at runtime
- Credentials are retrieved from AWS Secrets Manager at instance boot

### Transaction behavior

- Each request executes within a transactional boundary
- Failed operations result in transaction rollback

---

## Response handling

### Successful responses

- Use standard HTTP status codes:
    - `200 OK`
    - `201 Created`
- Responses are serialized as JSON

### Error responses

Common error scenarios include:

| Status | Meaning                         |
|--------|---------------------------------|
| 400    | Validation or malformed request |
| 401    | Authentication failure          |
| 403    | Authorization failure           |
| 404    | Resource not found              |
| 409    | Business rule conflict          |
| 5xx    | Internal server error           |

---

## Pagination and filtering

### Listing orders

The `GET /orders` endpoint supports:

- Pagination (`page`, `size`)
- Sorting (`sort`)
- Optional filtering by status

Defaults:
- `page = 0`
- `size = 20`
- `sort = id,asc`

This prevents unbounded queries and supports efficient result handling.

---

## Failure behavior

### Application-level failures

- Exceptions are logged
- Errors are returned with appropriate HTTP status codes
- Repeated failures cause the instance to be marked unhealthy

### Dependency failures

- Database unavailability results in 5xx errors
- RDS failover is handled transparently after reconnection

---

## Observability during request handling

- Request success/failure is visible via ALB metrics
- Latency is tracked via ALB target response time
- Logs provide request context and error details

See [Observability](07-observability.md) for details.

---

## Summary

A request to the Orders App:

- Enters through a single public entrypoint (API Gateway)
- Is routed privately within the VPC
- Is served only by healthy application instances
- Interacts with a highly available database
- Produces observable signals for monitoring and debugging

This flow prioritizes **security, clarity, and predictable behavior**.
