package com.agdd.service;

import com.agdd.dto.NotificationDto;
import com.agdd.entity.Inspection;
import com.agdd.entity.Notification;
import com.agdd.entity.User;
import com.agdd.repository.InspectionRepository;
import com.agdd.repository.NotificationRepository;
import com.agdd.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final InspectionRepository inspectionRepository;
    private final EmailService emailService;
    private final SettingsService settingsService;

    private final SimpMessagingTemplate messagingTemplate;
    private final SimpUserRegistry simpUserRegistry;

    /**
     * Returns notifications for the currently authenticated user.
     *
     * Recent inspection results are synchronized before returning
     * the notification list.
     */
    @Transactional
    public List<NotificationDto> getMyNotifications(String username) {

        User user = findUser(username);

        synchronizeInspectionNotifications(user);

        return notificationRepository
                .findTop30ByUserOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(String username) {

        User user = findUser(username);

        return notificationRepository
                .countByUserAndReadFalse(user);
    }

    @Transactional
    public void markAsRead(
            String username,
            Long notificationId
    ) {

        User user = findUser(username);

        Notification notification =
                notificationRepository
                        .findById(notificationId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "Notification not found"
                                )
                        );

        if (!notification.getUser().getId().equals(user.getId())) {
            throw new IllegalArgumentException(
                    "Notification does not belong to current user"
            );
        }

        notification.setRead(true);

        notificationRepository.save(notification);
    }

    @Transactional
    public void markAllAsRead(String username) {

        User user = findUser(username);

        List<Notification> notifications =
                notificationRepository
                        .findByUserAndReadFalseOrderByCreatedAtDesc(user);

        notifications.forEach(
                notification -> notification.setRead(true)
        );

        notificationRepository.saveAll(notifications);
    }

    /**
     * Called immediately after a new inspection is saved.
     *
     * Every currently connected authenticated WebSocket user
     * receives the notification in real time.
     */
    @Transactional
    public void processNewInspection(Inspection inspection) {

        if (!isNotificationWorthy(inspection)) {
            return;
        }

        System.out.println(
                "[AGDD] Processing notification for inspection #"
                        + inspection.getId()
        );

        /*
         * Create the notification and send the email for every
         * enabled user who has a valid email address.
         *
         * This works even when the user is NOT connected
         * through WebSocket.
         */
        List<User> users = userRepository.findAll();

        for (User user : users) {

            try {

                if (!user.isEnabled()) {
                    System.out.println(
                            "[AGDD] Skipping disabled user: "
                                    + user.getUsername()
                    );
                    continue;
                }

                if (user.getEmail() == null
                        || user.getEmail().isBlank()) {
                    System.out.println(
                            "[AGDD] Skipping user without email: "
                                    + user.getUsername()
                    );
                    continue;
                }

                NotificationDto notification =
                        createInspectionNotification(
                                user,
                                inspection
                        );

                if (notification != null) {

                    System.out.println(
                            "[AGDD] Notification processed for "
                                    + user.getUsername()
                    );
                }

            } catch (Exception error) {

                System.err.println(
                        "[AGDD] Failed to process notification for "
                                + user.getUsername()
                                + ": "
                                + error.getMessage()
                );
            }
        }

        /*
         * Realtime WebSocket notification for users currently
         * connected to the AGDD dashboard.
         */
        for (SimpUser simpUser : simpUserRegistry.getUsers()) {

            String username = simpUser.getName();

            try {

                User user =
                        userRepository
                                .findByUsername(username)
                                .orElse(null);

                if (user == null) {
                    continue;
                }

                NotificationDto notification =
                        createInspectionNotification(
                                user,
                                inspection
                        );

                if (notification != null) {

                    messagingTemplate.convertAndSendToUser(
                            username,
                            "/queue/notifications",
                            notification
                    );

                    System.out.println(
                            "[AGDD] Realtime notification sent to "
                                    + username
                    );
                }

            } catch (Exception error) {

                System.err.println(
                        "[AGDD] Failed realtime notification for "
                                + username
                                + ": "
                                + error.getMessage()
                );
            }
        }
    }

    /**
     * Creates an inspection notification if it does not already exist.
     */
    @Transactional
    public NotificationDto createInspectionNotification(
            User user,
            Inspection inspection
    ) {

        String status =
                normalize(inspection.getStatus());

        String eventKey =
                "INSPECTION-"
                        + inspection.getId()
                        + "-"
                        + status;

        if (notificationRepository
                .existsByUserAndEventKey(user, eventKey)) {

            return notificationRepository
                    .findTop30ByUserOrderByCreatedAtDesc(user)
                    .stream()
                    .filter(n ->
                            eventKey.equals(n.getEventKey())
                    )
                    .findFirst()
                    .map(this::toDto)
                    .orElse(null);
        }

        String defectType =
                inspection.getDefectType();

        String pieceId =
                inspection.getPieceId();

        String title;
        String message;
        String type;

        if (isDefect(inspection)) {

            title = "Defective gear detected";

            message =
                    "Inspection #" + inspection.getId()
                            + " identified a defective gear"
                            + (pieceId != null && !pieceId.isBlank()
                            ? " (Piece: " + pieceId + ")"
                            : "")
                            + "."
                            + (defectType != null
                            && !defectType.isBlank()
                            ? " Defect type: " + defectType + "."
                            : "");

            type = "CRITICAL";

        } else if (isUncertain(inspection)) {

            title = "Inspection requires attention";

            message =
                    "Inspection #" + inspection.getId()
                            + " returned an uncertain result"
                            + (pieceId != null && !pieceId.isBlank()
                            ? " (Piece: " + pieceId + ")"
                            : "")
                            + ".";

            type = "WARNING";

        } else {

            title = "Inspection failed";

            message =
                    "Inspection #" + inspection.getId()
                            + " returned status: "
                            + inspection.getStatus()
                            + ".";

            type = "WARNING";
        }

        Notification notification =
                Notification.builder()
                        .user(user)
                        .eventKey(eventKey)
                        .title(title)
                        .message(message)
                        .type(type)
                        .read(false)
                        .createdAt(LocalDateTime.now())
                        .build();

        Notification saved =
                notificationRepository.save(notification);

        NotificationDto dto = toDto(saved);

        sendEmailIfEnabled(
                user,
                title,
                message
        );

        return dto;
    }

    /**
     * Creates a notification manually for a specific user.
     */
    @Transactional
    public NotificationDto createForUser(
            User user,
            String eventKey,
            String title,
            String message,
            String type
    ) {

        if (notificationRepository
                .existsByUserAndEventKey(user, eventKey)) {

            return notificationRepository
                    .findTop30ByUserOrderByCreatedAtDesc(user)
                    .stream()
                    .filter(n ->
                            eventKey.equals(n.getEventKey())
                    )
                    .findFirst()
                    .map(this::toDto)
                    .orElse(null);
        }

        Notification notification =
                Notification.builder()
                        .user(user)
                        .eventKey(eventKey)
                        .title(title)
                        .message(message)
                        .type(type)
                        .read(false)
                        .createdAt(LocalDateTime.now())
                        .build();

        Notification saved =
                notificationRepository.save(notification);

        NotificationDto dto = toDto(saved);

        sendEmailIfEnabled(
                user,
                title,
                message
        );

        return dto;
    }

    /**
     * Synchronizes recent inspection results for the current user.
     *
     * This is kept as a fallback so notifications that happened
     * while the user was offline can still appear in the dashboard.
     */
    private void synchronizeInspectionNotifications(User user) {

        LocalDateTime since =
                LocalDateTime.now().minusHours(3);

        List<Inspection> recentInspections =
                inspectionRepository
                        .findByInspectedAtGreaterThanEqualOrderByInspectedAtAsc(
                                since
                        );

        for (Inspection inspection : recentInspections) {

            if (!isNotificationWorthy(inspection)) {
                continue;
            }

            createInspectionNotification(
                    user,
                    inspection
            );
        }
    }

    /**
     * Determines whether an inspection should generate
     * a notification.
     */
    private boolean isNotificationWorthy(
            Inspection inspection
    ) {

        if (inspection == null
                || inspection.getStatus() == null) {

            return false;
        }

        String status =
                normalize(inspection.getStatus());

        return isDefect(inspection)
                || isUncertain(inspection)
                || status.contains("FAIL")
                || status.contains("REJECT")
                || status.contains("NONCONFORM");
    }

    private boolean isDefect(
            Inspection inspection
    ) {

        String status =
                normalize(inspection.getStatus());

        String defectType =
                normalize(inspection.getDefectType());

        return status.contains("DEFECT")
                || defectType.contains("DEFECT")
                || status.contains("NG")
                || status.contains("NOT_OK")
                || status.contains("NOTOK");
    }

    private boolean isUncertain(
            Inspection inspection
    ) {

        String status =
                normalize(inspection.getStatus());

        return status.contains("UNCERTAIN")
                || status.contains("UNKNOWN")
                || status.contains("INCONCLUSIVE");
    }

    private String normalize(String value) {

        if (value == null) {
            return "";
        }

        return value
                .trim()
                .toUpperCase()
                .replace("-", "_")
                .replace(" ", "_");
    }

    private void sendEmailIfEnabled(
            User user,
            String title,
            String message
    ) {

        try {

            var payload =
                    settingsService.getSettings("system");

            Object enabled =
                    payload.getValues().get("emailAlerts");

            boolean emailAlerts =
                    enabled == null
                            || Boolean.TRUE.equals(enabled);

            if (!emailAlerts) {
                return;
            }

            if (user.getEmail() == null
                    || user.getEmail().isBlank()) {
                return;
            }

            emailService.sendNotificationEmail(
                    user.getEmail(),
                    title,
                    message
            );

        } catch (Exception error) {

            System.err.println(
                    "[AGDD] Failed to send notification email: "
                            + error.getMessage()
            );
        }
    }

    private User findUser(String username) {

        return userRepository
                .findByUsername(username)
                .orElseThrow(() ->
                        new IllegalStateException(
                                "User not found: " + username
                        )
                );
    }

    private NotificationDto toDto(
            Notification notification
    ) {

        return new NotificationDto(
                notification.getId(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getType(),
                notification.isRead(),
                notification.getCreatedAt()
        );
    }
}

