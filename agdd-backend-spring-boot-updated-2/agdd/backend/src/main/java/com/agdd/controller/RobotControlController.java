package com.agdd.controller;

import com.agdd.dto.ActionResponse;
import com.agdd.dto.RobotStatusResponse;
import com.agdd.service.RobotProcessManager;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Contrôle le pipeline robot (tcp_publisher + move_group + inspection_node).
 * Endpoints consommés par RobotControlService (Angular) :
 *   POST /api/robot/start  -> { ok, message }
 *   POST /api/robot/stop   -> { ok, message }
 *   GET  /api/robot/status -> { items: [{ name, running, pid }] }
 *
 * Accessible à tout utilisateur authentifié (comme /api/dashboard).
 * Pour restreindre (ex: ADMIN/OPERATOR uniquement), ajoutez une règle dans
 * SecurityConfig: .requestMatchers("/api/robot/**").hasAnyRole("ADMIN", "OPERATOR")
 */
@RestController
@RequestMapping("/api/robot")
@RequiredArgsConstructor
public class RobotControlController {

    private final RobotProcessManager processManager;

    @PostMapping("/start")
    public ResponseEntity<ActionResponse> start() {
        try {
            String message = processManager.startPipeline();
            return ResponseEntity.ok(new ActionResponse(true, message));
        } catch (Exception e) {
            return ResponseEntity.ok(new ActionResponse(false, "Erreur au démarrage: " + e.getMessage()));
        }
    }

    @PostMapping("/stop")
    public ResponseEntity<ActionResponse> stop() {
        try {
            String message = processManager.stopPipeline();
            return ResponseEntity.ok(new ActionResponse(true, message));
        } catch (Exception e) {
            return ResponseEntity.ok(new ActionResponse(false, "Erreur à l'arrêt: " + e.getMessage()));
        }
    }

    @GetMapping("/status")
    public ResponseEntity<RobotStatusResponse> status() {
        return ResponseEntity.ok(new RobotStatusResponse(processManager.getStatus()));
    }
}
