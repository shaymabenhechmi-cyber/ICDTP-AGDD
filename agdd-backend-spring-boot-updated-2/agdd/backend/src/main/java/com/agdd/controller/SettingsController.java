package com.agdd.controller;

import com.agdd.dto.SettingsDto;
import com.agdd.service.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;

    @GetMapping("/{category}")
    public ResponseEntity<SettingsDto> getSettings(@PathVariable String category) {
        return ResponseEntity.ok(settingsService.getSettings(category));
    }

    @PutMapping("/{category}")
    public ResponseEntity<SettingsDto> saveSettings(@PathVariable String category, @RequestBody Map<String, Object> values) {
        return ResponseEntity.ok(settingsService.saveSettings(category, values));
    }
}
