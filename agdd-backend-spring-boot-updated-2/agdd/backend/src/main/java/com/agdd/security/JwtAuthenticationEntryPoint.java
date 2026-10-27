package com.agdd.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;

/**
 * Returns a clean 401 JSON response instead of the default Spring whitelabel error page
 * whenever an unauthenticated user tries to access a protected endpoint.
 */
@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    //transforme Java → JSON
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    //appelée automatiquement par Spring Security
    public void commence(HttpServletRequest request, HttpServletResponse response,
                          AuthenticationException authException) throws IOException, ServletException {
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        //tetb3th reponse lil client
        response.getWriter().write(objectMapper.writeValueAsString(
                Map.of("status", 401, "error", "Unauthorized", "message", "Invalid or missing authentication token")
        ));
    }
}
