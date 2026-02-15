package com.order.management.ecsec2;

import org.springframework.boot.SpringApplication;

public class TestEcsec2Application {

	public static void main(String[] args) {
		SpringApplication.from(Ecsec2Application::main).with(TestcontainersConfiguration.class).run(args);
	}

}
