package com.order.management.lambdaaurora.config;

public record DbConfig(
    String host,
    int port,
    String name,
    String secretArn
) {

}
