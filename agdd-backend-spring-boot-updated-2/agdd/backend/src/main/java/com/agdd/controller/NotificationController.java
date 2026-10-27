package com.agdd.controller;

import com.agdd.dto.NotificationDto;
import com.agdd.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/me")
    public ResponseEntity<List<NotificationDto>> getMyNotifications(
            Authentication authentication
    ) {

        return ResponseEntity.ok(
                notificationService.getMyNotifications(
                        authentication.getName()
                )
        );
    }

    @GetMapping("/me/unread-count")
    public ResponseEntity<Long> getUnreadCount(
            Authentication authentication
    ) {

        return ResponseEntity.ok(
                notificationService.getUnreadCount(
                        authentication.getName()
                )
        );
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<Void> markAsRead(
            Authentication authentication,
            @PathVariable Long id
    ) {

        notificationService.markAsRead(
                authentication.getName(),
                id
        );

        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/me/read-all")
    public ResponseEntity<Void> markAllAsRead(
            Authentication authentication
    ) {

        notificationService.markAllAsRead(
                authentication.getName()
        );

        return ResponseEntity.noContent().build();
    }
}
