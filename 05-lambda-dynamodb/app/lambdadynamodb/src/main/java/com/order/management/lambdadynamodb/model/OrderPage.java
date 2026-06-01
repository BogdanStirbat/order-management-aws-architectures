package com.order.management.lambdadynamodb.model;

import java.util.List;

public record OrderPage(
    List<Order> orders,
    String nextToken) {

}
