# Architecture 5: Lambda with DynamoDB

This application is deployed on AWS using AWS Lambda, with a DynamoDB database.

## Architecture

![Architecture Diagram](docs/diagrams/architecture.png)

Full explanation: [docs/00-architecture.md](docs/00-architecture.md)

## Features
- Secure authentication with JWT using Amazon Cognito
- Serverless Java 21 API backend using AWS Lambda
- API Gateway HTTP API with Cognito JWT authorizer
- DynamoDB database access
- SnapStart enabled for published Java Lambda versions
- CloudWatch logs, API Gateway access logs, metrics, and alarms
- Infrastructure as Code with AWS CDK

## Tech stack

### Backend

- Java 21
- AWS Lambda Java runtime
- API Gateway HTTP API event handling
- Lightweight custom routing layer
- Service and repository layers
- DynamoDB operations
- Jackson for JSON serialization/deserialization

### Infrastructure

- AWS CDK with TypeScript
- AWS Lambda for the Orders API backend
- Amazon API Gateway HTTP API
- Amazon Cognito User Pool for JWT authentication
- DynamoDB
- Amazon CloudWatch for logs, metrics, alarms, and API access logs

## Deployment procedure

Deployment procedure can be found [here](docs/01-deployment.md) .

## Testing procedure

Testing procedure can be found [here](docs/01-deployment.md) .

## API overview

The application exposes a Cognito-protected Orders API through API Gateway HTTP API.

| Method | Path                  | Description                                |
|--------|-----------------------|--------------------------------------------|
| `POST` | `/orders`             | Create a new order                         |
| `GET`  | `/orders`             | List orders, optionally filtered by status |
| `GET`  | `/orders/{id}`        | Retrieve an order by ID                    |
| `PUT`  | `/orders/{id}/cancel` | Cancel an order idempotently               |

For request and response examples, see [API documentation](docs/02-api.md).

## Observability

The system includes observability for the API, Lambda backend, and DynamoDB database layer.

### Logs

- Lambda application logs in Amazon CloudWatch Logs
- API Gateway HTTP API access logs in Amazon CloudWatch Logs

### Metrics

- Lambda metrics:
    - Errors
    - Throttles
    - Duration
    - Concurrent executions
- API Gateway HTTP API metrics:
    - Request count
    - 4xx errors
    - 5xx errors
    - Latency
    - Integration latency
- DynamoDB metrics:
    - Throttled requests 
    - System errors 

### Alarms

- Lambda errors
- Lambda throttles
- Lambda p95 duration
- Lambda concurrent executions near the reserved concurrency limit
- API Gateway 4xx error rate
- API Gateway 5xx error rate
- API Gateway p95 latency
- API Gateway integration p95 latency
- DynamoDB throttled requests
- DynamoDB system errors

## Security

- JWT-based authentication using Amazon Cognito
- API Gateway HTTP API protected with a Cognito user pool authorizer
- Authentication is enforced at API Gateway before requests reach Lambda
- Route-level authorization scopes and user/tenant ownership checks are not currently implemented

## Design Highlights

- Serverless API backend with AWS Lambda
    - No application servers to manage
    - Scales automatically with incoming API traffic
    - Fits the small, event-driven Orders API workload

- Java 21 Lambda runtime with SnapStart
    - Keeps the backend implementation type-safe and familiar
    - SnapStart is enabled for published versions to improve Java cold-start behavior

- API Gateway HTTP API instead of REST API
    - Lower-cost and simpler option for HTTP-based APIs
    - Native integration with Lambda
    - Supports Cognito JWT authorization

- Cognito-based JWT authentication
    - API Gateway validates tokens before invoking Lambda
    - Keeps authentication outside the application code
    - The Lambda handler can focus on request routing and business logic

- DynamoDB
    - Managed, serverless NoSQL database
    - Supports the Orders API access patterns with a primary key and two GSIs
    - Uses on-demand billing for development simplicity

- CDK stack separation
    - Infrastructure is split into focused stacks: DynamoDB, Lambda, Cognito, API, and monitoring.
    - Makes deployment order and dependencies easier to understand
    - Helps document the role of each infrastructure layer

- CloudWatch-based observability
    - Lambda logs, API Gateway access logs are centralized in CloudWatch Logs
    - Alarms cover Lambda, API Gateway, and DynamoDB
    - Provides operational visibility without adding extra observability tooling

## Future Improvements

- CI/CD pipeline
    - Build and test the Java Lambda application automatically
    - Run CDK synth/diff checks on pull requests
    - Deploy infrastructure through GitHub Actions or another CI/CD system

- Safer production removal policies
    - Enable DynamoDB point-in-time recovery and deletion protection for production
    - Define a documented backup and restore process
    - Replace development-friendly `RemovalPolicy.DESTROY` with production-safe retention settings for critical resources

- Lambda deployment safety
    - Add canary or linear deployments using Lambda aliases
    - Add automatic rollback based on CloudWatch alarms
    - Run smoke tests after deployment
  
- Idempotency
    - Add idempotency keys for order creation  

- Custom domain and TLS
    - Add a custom domain for API Gateway
    - Use AWS Certificate Manager for TLS certificates
    - Configure a cleaner public API URL

- Distributed tracing
    - Enable AWS X-Ray tracing for Lambda and API Gateway
    - Consider OpenTelemetry instrumentation if deeper tracing is needed
    - Propagate correlation IDs through logs and responses

- Stronger API protection
    - Add AWS WAF in front of API Gateway
    - Add rate limiting or throttling rules
    - Add usage plans or API keys if exposing the API to external consumers
    - Add route-level authorization scopes
    - Add user or tenant ownership checks for orders

- More complete security hardening
    - Review IAM permissions for least privilege
    - Add stricter Cognito password and account recovery policies

- Performance and cost tuning
    - Tune Lambda memory size and timeout based on real metrics

- Operational runbooks
    - Document how to investigate Lambda errors, API 5xx responses
    - Document how to restore the database from backups
    - Document how to safely destroy the development environment
