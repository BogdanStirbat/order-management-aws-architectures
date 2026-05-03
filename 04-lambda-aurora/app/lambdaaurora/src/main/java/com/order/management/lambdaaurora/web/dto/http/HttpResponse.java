package com.order.management.lambdaaurora.web.dto.http;

import java.util.Map;

public record HttpResponse(
    int statusCode,
    Object body,
    Map<String, String> headers
) {

}
