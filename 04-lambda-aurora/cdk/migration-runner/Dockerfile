FROM flyway/flyway:10

COPY migration /flyway/sql

ENTRYPOINT ["flyway"]
CMD ["migrate"]
