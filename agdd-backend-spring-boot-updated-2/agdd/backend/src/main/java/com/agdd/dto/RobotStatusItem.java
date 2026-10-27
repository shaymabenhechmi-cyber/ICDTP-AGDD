package com.agdd.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Statut d'un process du pipeline robot (tcp_publisher, move_group, inspection_node).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RobotStatusItem {
    private String name;
    private boolean running;
    private Long pid; // null si le process n'est pas lancé
}
