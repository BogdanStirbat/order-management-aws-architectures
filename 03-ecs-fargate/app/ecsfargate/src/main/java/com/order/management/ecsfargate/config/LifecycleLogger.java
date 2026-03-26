package com.order.management.ecsfargate.config;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LifecycleLogger {

  private static final Logger log = LoggerFactory.getLogger(LifecycleLogger.class);

  @PostConstruct
  public void onStartup() {
    log.info("Application started successfully");
  }

  @PreDestroy
  public void onShutdown() {
    log.info("Application is shutting down gracefully");
  }
}
