package com.order.management.ecsfargate.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@Profile("!test")
public class SecurityConfig {

  /**
   * Enforce Cognito access-token validation:
   * - issuer must match the user pool
   * - token_use must be "access"
   * - client_id must match the Cognito app client id
   */
  @Bean
  JwtDecoder jwtDecoder(@Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}") String issuer,
      @Value("${cognito.user.pool.client.id:}") String userPoolClientId) {
    // Builds a decoder that fetches JWKS from the issuer's metadata
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withIssuerLocation(issuer).build();

    OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefaultWithIssuer(issuer);

    if (userPoolClientId != null && !userPoolClientId.isBlank()) {
      OAuth2TokenValidator<Jwt> withAccessTokenUse =
          new JwtClaimValidator<String>("token_use", "access"::equals);

      OAuth2TokenValidator<Jwt> withClientId = jwt -> {
        String clientId = jwt.getClaimAsString("client_id");
        if (userPoolClientId.equals(clientId)) {
          return OAuth2TokenValidatorResult.success();
        }
        OAuth2Error err = new OAuth2Error(
            "invalid_token",
            "The required client_id is missing or invalid",
            null
        );
        return OAuth2TokenValidatorResult.failure(err);
      };

      decoder.setJwtValidator(new DelegatingValidator(withIssuer, withAccessTokenUse, withClientId));
    } else {
      decoder.setJwtValidator(withIssuer);
    }

    return decoder;
  }

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        // Stateless REST API
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).csrf(csrf -> csrf.disable())

        // Authorization rules
        .authorizeHttpRequests(auth -> auth
            // Allow ALB/API Gateway health checks
            .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()

            // Optional: keep Swagger locked down (recommended for production)
            // If you want Swagger public, permit these instead.
            // .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()

            // Everything else requires a valid JWT
            .anyRequest().authenticated())

        // JWT Resource Server
        .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));

    return http.build();
  }

  /**
   * Spring expects a single validator; use a small adapter to combine two validators. (Avoids importing extra classes just
   * for composition.)
   */
  static class DelegatingValidator implements OAuth2TokenValidator<Jwt> {

    private final List<OAuth2TokenValidator<Jwt>> validators;

    @SafeVarargs
    DelegatingValidator(OAuth2TokenValidator<Jwt>... validators) {
      this.validators = List.of(validators);
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
      OAuth2TokenValidatorResult result = OAuth2TokenValidatorResult.success();
      for (OAuth2TokenValidator<Jwt> v : validators) {
        OAuth2TokenValidatorResult r = v.validate(token);
        if (r.hasErrors()) {
          return r;
        }
        result = r;
      }
      return result;
    }
  }

}
