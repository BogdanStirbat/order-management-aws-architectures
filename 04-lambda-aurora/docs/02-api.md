# API documentation

## Authentication

All API endpoints require a Cognito JWT ID token passed as a bearer token:

```
Authorization: Bearer <ID_TOKEN>
```

## Endpoints

### Create order 

```
POST /orders
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json
```

Request body:
```
{
  "totalAmount": 49.99
}
```

Successful response:

```
201 Created
Location: /orders/1
Content-Type: application/json
```

```
{
  "id": 1,
  "version": 0,
  "status": "CREATED",
  "totalAmount": 49.99,
  "createdAt": "2026-01-01T10:00:00Z",
  "updatedAt": "2026-01-01T10:00:00Z"
}
```

### List orders

```
GET /orders?status=CREATED&page=0&size=20
Authorization: Bearer <ID_TOKEN>
```

Query parameters:

| Name   | Required | Default | Description                               |
|--------|----------|---------|-------------------------------------------|
| status | No       | none    | One of `CREATED`, `CANCELLED`.            |
| page   | No       | 0       | Zero-based page number.                   |
| size   | No       | 20      | Page size. Must be between `1` and `100`. |

Successful response:

```
[
  {
    "id": 1,
    "version": 0,
    "status": "CREATED",
    "totalAmount": 49.99,
    "createdAt": "2026-01-01T10:00:00Z",
    "updatedAt": "2026-01-01T10:00:00Z"
  }
]
```

### Get order by ID

```
GET /orders/1
Authorization: Bearer <ID_TOKEN>
```

Successful response:

```
{
  "id": 1,
  "version": 0,
  "status": "CREATED",
  "totalAmount": 49.99,
  "createdAt": "2026-01-01T10:00:00Z",
  "updatedAt": "2026-01-01T10:00:00Z"
}
```

### Cancel order 

``` 
PUT /orders/1/cancel
Authorization: Bearer <ID_TOKEN>
```

Successful response:

```
{
  "id": 1,
  "version": 1,
  "status": "CANCELLED",
  "totalAmount": 49.99,
  "createdAt": "2026-01-01T10:00:00Z",
  "updatedAt": "2026-01-01T10:05:00Z"
}
```

Calling the cancel endpoint for an already cancelled order is idempotent and returns the existing cancelled order.

## Error responses

Errors use this shape:

```
{
  "message": "Error message"
}
```

Common status codes:

| Status        | Meaning                                                                           |
|---------------|-----------------------------------------------------------------------------------|
| `400`         | Invalid request, malformed JSON, invalid query parameter, or invalid order amount |
| `401` / `403` | Missing, invalid, or unauthorized Cognito token                                   |
| `404`         | Route or order not found                                                          |
| `500`         | Internal server error                                                             |

