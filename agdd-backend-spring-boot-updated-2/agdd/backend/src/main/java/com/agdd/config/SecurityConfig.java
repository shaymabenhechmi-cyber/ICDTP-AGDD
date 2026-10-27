package com.agdd.config;

import com.agdd.security.CustomUserDetailsService;
import com.agdd.security.JwtAuthFilter;
import com.agdd.security.JwtAuthenticationEntryPoint;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final CustomUserDetailsService userDetailsService;
    private final JwtAuthFilter jwtAuthFilter;
    private final JwtAuthenticationEntryPoint authenticationEntryPoint;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();

        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());

        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config
    ) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        http
                .csrf(AbstractHttpConfigurer::disable)

                .cors(cors ->
                        cors.configurationSource(corsConfigurationSource())
                )

                .exceptionHandling(ex ->
                        ex.authenticationEntryPoint(authenticationEntryPoint)
                )

                .sessionManagement(sm ->
                        sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )

                .authorizeHttpRequests(auth -> auth

                        // =====================================================
                        // PUBLIC
                        // =====================================================

                        .requestMatchers("/api/auth/**")
                        .permitAll()

                        .requestMatchers(HttpMethod.OPTIONS, "/**")
                        .permitAll()

                        // =====================================================
                        // ROBOT / INSPECTION
                        // =====================================================

                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/inspection/results"
                        )
                        .permitAll()

                        // =====================================================
                        // PERSONAL PROFILE
                        // Accessible by ADMIN, OPERATOR and VISITOR
                        // =====================================================

                        .requestMatchers("/api/users/me/**")
                        .authenticated()

                        // =====================================================
                        // ADMIN ONLY
                        // User management
                        // =====================================================

                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/users"
                        )
                        .hasAuthority("ROLE_ADMIN")

                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/users/**"
                        )
                        .hasAuthority("ROLE_ADMIN")

                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/users"
                        )
                        .hasAuthority("ROLE_ADMIN")

                        .requestMatchers(
                                HttpMethod.PUT,
                                "/api/users/**"
                        )
                        .hasAuthority("ROLE_ADMIN")

                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/api/users/**"
                        )
                        .hasAuthority("ROLE_ADMIN")

                        // Roles management
                        .requestMatchers("/api/roles/**")
                        .hasRole("ADMIN")

                        // System settings
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/settings/camera"
                        )
                        .authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/settings/robot")
                        .authenticated()
                        .requestMatchers("/api/settings/**")
                        .hasRole("ADMIN")                        // =====================================================
                        // WEBSOCKET NOTIFICATIONS
                        // JWT authentication is handled during STOMP CONNECT
                        // =====================================================

                        .requestMatchers("/ws/notifications/**")
                        .permitAll()


                        // =====================================================
                        // EVERYTHING ELSE
                        // Requires authentication
                        // =====================================================

                        .anyRequest()
                        .authenticated()
                )

                .authenticationProvider(authenticationProvider())

                .addFilterBefore(
                        jwtAuthFilter,
                        UsernamePasswordAuthenticationFilter.class
                );

        return http.build();
    }

    /**
     * CORS configuration
     * Allows Angular frontend to communicate with Spring Boot.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration configuration = new CorsConfiguration();

        configuration.setAllowedOriginPatterns(
                List.of(
                        "http://localhost:*",
                        "http://127.0.0.1:*",
                        "http://192.168.100.11:*"
                )
        );

        configuration.setAllowedMethods(
                List.of(
                        "GET",
                        "POST",
                        "PUT",
                        "DELETE",
                        "PATCH",
                        "OPTIONS"
                )
        );

        configuration.setAllowedHeaders(
                List.of("*")
        );

        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration(
                "/**",
                configuration
        );

        return source;
    }
}

