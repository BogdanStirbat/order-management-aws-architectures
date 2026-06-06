# API documentation

## Authentication

All API endpoints require a Cognito JWT id token passed as a bearer token:

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
Location: /orders/4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91
Content-Type: application/json
```

```
{
  "id": "4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91",
  "version": 0,
  "status": "CREATED",
  "totalAmount": 49.99,
  "createdAt": "2026-01-01T10:00:00Z",
  "updatedAt": "2026-01-01T10:00:00Z"
}
```

### List orders

```
GET /orders?status=CREATED&limit=40&nextToken=<NEXT_TOKEN>
Authorization: Bearer <ID_TOKEN>
```

Query parameters:

| Name      | Required | Default | Description                                                           |
|-----------|----------|---------|-----------------------------------------------------------------------|
| status    | No       | none    | Optional order status filter. Allowed values: `CREATED`, `CANCELLED`. |
| limit     | No       | 20      | Number of items to be retrieved. Allowed range: `1` to `100`.         |
| nextToken | No       | none    | Cursor-based pagination token returned by a previous list response.   |

Successful response:

200 OK 
Content-Type: application/json

```
{
  "orders": [
    {
      "id": 4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91,
      "version": 0,
      "status": "CREATED",
      "totalAmount": 49.99,
      "createdAt": "2026-01-01T10:00:00Z",
      "updatedAt": "2026-01-01T10:00:00Z"
    }
  ],
  "nextToken": "nextTokenValue"
}
```

List results are cursor-based and may be eventually consistent because they come from DynamoDB GSIs.

If there are no more results, `nextToken` is `null`.

To retrieve the next page, pass the returned token:

```
GET /orders?status=CREATED&limit=20&nextToken=nextTokenValue
Authorization: Bearer <ID_TOKEN>
```

### Get order by ID

```
GET /orders/4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91
Authorization: Bearer <ID_TOKEN>
```

Successful response:

```
200 OK
Content-Type: application/json
```

```
{
  "id": 4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91,
  "version": 0,
  "status": "CREATED",
  "totalAmount": 49.99,
  "createdAt": "2026-01-01T10:00:00Z",
  "updatedAt": "2026-01-01T10:00:00Z"
}
```

### Cancel order

``` 
PUT /orders/4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91/cancel
Authorization: Bearer <ID_TOKEN>
```

Successful response:

```
200 OK
Content-Type: application/json
```

```
{
  "id": 4f9b6a2e-9f1e-4c9d-9a0e-3b3a7d5e1a91,
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

