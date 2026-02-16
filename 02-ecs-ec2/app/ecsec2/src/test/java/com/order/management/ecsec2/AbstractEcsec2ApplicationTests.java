package com.order.management.ecsec2;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;

@Sql(scripts = "/sql/cleanup_test_data.sql", executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(scripts = "/sql/cleanup_test_data.sql", executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Import(TestcontainersConfiguration.class)
@SpringBootTest
public abstract class AbstractEcsec2ApplicationTests {

}
