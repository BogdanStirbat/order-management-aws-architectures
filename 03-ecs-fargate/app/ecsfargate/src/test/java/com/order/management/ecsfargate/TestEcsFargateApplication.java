package com.order.management.ecsfargate;

import org.springframework.boot.SpringApplication;

public class TestEcsFargateApplication {

	public static void main(String[] args) {
		SpringApplication.from(EcsFargateApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
