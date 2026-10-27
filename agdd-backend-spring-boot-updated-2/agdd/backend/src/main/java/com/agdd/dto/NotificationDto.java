package com.agdd.dto;

import java.time.LocalDateTime;

public record NotificationDto(
        Long id,
        String title,
        String message,
        String type,
        boolean read,
        LocalDateTime createdAt
) {
}
