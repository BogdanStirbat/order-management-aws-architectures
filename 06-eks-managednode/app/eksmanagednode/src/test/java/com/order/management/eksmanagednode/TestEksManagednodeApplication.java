package com.order.management.eksmanagednode;

import org.springframework.boot.SpringApplication;

public class TestEksManagednodeApplication {

	public static void main(String[] args) {
		SpringApplication.from(EksManagednodeApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
