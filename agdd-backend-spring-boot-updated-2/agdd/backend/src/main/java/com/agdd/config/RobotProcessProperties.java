package com.agdd.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Mappe les propriétés "robot.*" de application.properties.
 * Adaptez les commandes par défaut à votre setup ROS2 réel (chemins, launch files...).
 */
@Component
@ConfigurationProperties(prefix = "robot")
@Data
public class RobotProcessProperties {

    /** Commande shell pour lancer le publisher TCP (aruco). */
    private String tcpPublisherCommand = "python3 /home/user/ros2_ws/src/tcp_publisher/tcp_publisher.py";

    /** Commande shell pour lancer move_group / bringup MoveIt. */
    private String moveGroupCommand = "ros2 launch my_robot_moveit_config move_group.launch.py";

    /** Commande shell pour lancer le nœud d'inspection (pipeline pick + détection engrenage). */
    private String inspectionNodeCommand = "ros2 run inspection_pkg inspection_node";

    /** Texte à chercher dans les logs de move_group pour savoir qu'il est prêt. */
    private String moveGroupReadyMarker = "You can start planning now!";

    /** Délai max (secondes) pour attendre que move_group soit prêt avant d'abandonner. */
    private int moveGroupReadyTimeoutSeconds = 30;

    /** Dossier où écrire les logs de chaque process lancé. */
    private String logDirectory = "/tmp/agdd-robot-logs";
}
