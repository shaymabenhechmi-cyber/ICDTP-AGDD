package com.agdd.service;

import com.agdd.dto.SettingsDto;
import com.agdd.entity.AppSetting;
import com.agdd.repository.AppSettingRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Stores/retrieves settings for each configuration category (camera, robot,
 * ai, system). Values are persisted as JSON so this stays generic and does
 * not require schema changes when new settings fields are added later.
 */
@Service
@RequiredArgsConstructor
public class SettingsService {

    private final AppSettingRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @SneakyThrows
    public SettingsDto getSettings(String category) {
        return repository.findByCategory(category)
                .map(this::toDto)
                .orElseGet(() -> new SettingsDto(category, defaultsFor(category)));
    }

    @SneakyThrows
    public SettingsDto saveSettings(String category, Map<String, Object> values) {
        AppSetting entity = repository.findByCategory(category)
                .orElseGet(() -> {
                    AppSetting a = new AppSetting();
                    a.setCategory(category);
                    return a;
                });

        entity.setSettingsJson(objectMapper.writeValueAsString(values));
        entity.setUpdatedAt(LocalDateTime.now());
        repository.save(entity);

        return new SettingsDto(category, values);
    }

    @SneakyThrows
    private SettingsDto toDto(AppSetting entity) {
        Map<String, Object> values = objectMapper.readValue(entity.getSettingsJson(), new TypeReference<>() {});
        return new SettingsDto(entity.getCategory(), values);
    }

    /** Sensible default values shown the first time a category has never been saved. */
    private Map<String, Object> defaultsFor(String category) {
        return switch (category) {
            case "camera" -> Map.of(
                    "activeCamera", "top",
                    "zoom", 100,
                    "brightness", 50,
                    "contrast", 50,
                    "exposure", 50,
                    "resolution", "1920x1080",
                    "frameRate", 30,
                    "autoWhiteBalance", true
            );
            case "robot" -> Map.of(
                    "armSpeed", 60,
                    "gripForce", 45,
                    "safetyZoneRadius", 80,
                    "sortingMode", "defectType",
                    "autoReturnHome", true,
                    "robotHost", "192.168.100.161",
                    "tcpPort", 9090,
                    "mode", "simulation"
            );
            case "ai" -> Map.of(
                    "confidenceThreshold", 75,
                    "model", "yolov8n",
                    "autoRetrain", false,
                    "rejectRateAlertThreshold", 8
            );
            case "system" -> Map.of(
                    "sessionTimeoutMinutes", 30,
                    "emailAlerts", true,
                    "pushAlerts", true,
                    "soundNotifications", false,
                    "dashboardAutoRefresh", true,
                    "dashboardRefreshInterval", 3,
                    "confirmRobotActions", true);
            default -> Map.of();
        };
    }
}

