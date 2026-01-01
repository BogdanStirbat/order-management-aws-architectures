package com.order.management.ec2ami;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class Ec2amiApplicationTests {

	@Test
	void contextLoads() {
	}

}
