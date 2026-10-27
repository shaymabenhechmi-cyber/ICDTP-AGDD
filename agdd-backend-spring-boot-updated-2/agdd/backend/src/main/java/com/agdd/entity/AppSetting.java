package com.agdd.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Generic settings storage: one row per configuration category
 * (camera, robot, ai, system...). The actual fields are stored as a JSON
 * blob in {@code settingsJson}, so new settings categories/fields can be
 * added later (once the real Camera/Robot/AI modules exist) without any
 * database migration.
 */
@Entity
@Table(name = "app_settings")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AppSetting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String category; // camera | robot | ai | system

    @Lob
    @Column(name = "settings_json", columnDefinition = "TEXT")
    private String settingsJson;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
