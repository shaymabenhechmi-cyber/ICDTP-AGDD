package com.agdd.security;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JwtWebSocketInterceptor implements ChannelInterceptor {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;

    @Override
    public Message<?> preSend(
            Message<?> message,
            MessageChannel channel
    ) {

        StompHeaderAccessor accessor =
                StompHeaderAccessor.wrap(message);

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {

            String authorization =
                    accessor.getFirstNativeHeader("Authorization");

            if (authorization != null
                    && authorization.startsWith("Bearer ")) {

                try {
                    String token =
                            authorization.substring(7);

                    String username =
                            jwtUtil.extractUsername(token);

                    if (username != null) {

                        UserDetails userDetails =
                                userDetailsService
                                        .loadUserByUsername(username);

                        if (jwtUtil.isTokenValid(
                                token,
                                userDetails
                        )) {

                            UsernamePasswordAuthenticationToken authentication =
                                    new UsernamePasswordAuthenticationToken(
                                            userDetails,
                                            null,
                                            userDetails.getAuthorities()
                                    );

                            accessor.setUser(authentication);
                        }
                    }

                } catch (Exception error) {

                    System.err.println(
                            "[AGDD] WebSocket JWT authentication failed: "
                                    + error.getMessage()
                    );
                }
            }
        }

        return message;
    }
}
