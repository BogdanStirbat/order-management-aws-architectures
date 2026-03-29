FROM public.ecr.aws/aws-observability/aws-otel-collector:latest

USER root
RUN yum install -y curl && yum clean all

COPY --chown=aoc:aoc otel-config.yaml /etc/otel-config.yaml

# switch back to non-root user
USER aoc