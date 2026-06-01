package com.order.management.lambdadynamodb.repository;

import com.order.management.lambdadynamodb.model.Order;
import java.util.List;

public record OrderPage(
    List<Order> orders,
    String nextToken) {

}
