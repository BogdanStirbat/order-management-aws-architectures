package com.order.management.lambdaaurora.web.dto.http;

import java.util.Map;

public record HttpRequest(
    String method,
    String path,
    Map<String, String> query,
    String body
) {

}
