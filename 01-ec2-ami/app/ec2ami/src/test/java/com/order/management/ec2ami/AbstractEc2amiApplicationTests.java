package com.order.management.ec2ami;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;

@Sql(scripts = "/sql/cleanup_test_data.sql", executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(scripts = "/sql/cleanup_test_data.sql", executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles("test")
public abstract class AbstractEc2amiApplicationTests {

}
