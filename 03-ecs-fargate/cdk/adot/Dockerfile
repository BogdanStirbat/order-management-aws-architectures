FROM public.ecr.aws/aws-observability/aws-otel-collector:latest

USER root
RUN yum install -y curl && yum clean all

COPY --chown=aoc:aoc otel-config.yaml /etc/otel-config.yaml

# switch back to non-root user
# user 'aoc' was determined after running "docker inspect adot-collector:latest --format '{{.Config.User}}'"
USER aoc