package com.order.management.ec2ami;

import org.springframework.boot.SpringApplication;

public class TestEc2amiApplication {

	public static void main(String[] args) {
		SpringApplication.from(Ec2amiApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
