package com.agdd.service;

import com.agdd.config.RobotProcessProperties;
import com.agdd.dto.RobotStatusItem;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Gère le cycle de vie du pipeline robot AGDD :
 *   1) tcp_publisher (aruco)
 *   2) move_group (MoveIt) — on attend qu'il soit prêt
 *   3) inspection_node — lancé seulement une fois move_group prêt (fait le pick + détection engrenage)
 *
 * Un seul pipeline actif à la fois.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RobotProcessManager {

    public static final String TCP_PUBLISHER = "tcp_publisher";
    public static final String MOVE_GROUP = "move_group";
    public static final String INSPECTION_NODE = "inspection_node";

    private final RobotProcessProperties properties;

    private final Map<String, Process> runningProcesses = new ConcurrentHashMap<>();

    private volatile boolean pipelineStarting = false;

    public synchronized String startPipeline() {
        if (pipelineStarting || isRunning(MOVE_GROUP) || isRunning(INSPECTION_NODE)) {
            return "Pipeline déjà en cours ou en cours de démarrage.";
        }
        pipelineStarting = true;

        try {
            ensureLogDirectory();

            launchProcess(TCP_PUBLISHER, properties.getTcpPublisherCommand());
            launchProcess(MOVE_GROUP, properties.getMoveGroupCommand());

            CompletableFuture.runAsync(() -> {
                boolean ready = waitForMoveGroupReady();
                if (ready) {
                    launchProcess(INSPECTION_NODE, properties.getInspectionNodeCommand());
                    log.info("Pipeline: inspection_node lancé après confirmation move_group prêt.");
                } else {
                    log.error("Pipeline: move_group n'a pas signalé être prêt dans le délai imparti. "
                            + "inspection_node non lancé.");
                }
                pipelineStarting = false;
            });

            return "Pipeline démarré : tcp_publisher + move_group lancés, "
                    + "inspection_node suivra automatiquement dès que move_group sera prêt.";
        } catch (Exception e) {
            pipelineStarting = false;
            log.error("Échec du démarrage du pipeline", e);
            throw new RuntimeException("Échec du démarrage du pipeline: " + e.getMessage(), e);
        }
    }

    public synchronized String stopPipeline() {
        stopProcess(INSPECTION_NODE);
        stopProcess(MOVE_GROUP);
        stopProcess(TCP_PUBLISHER);
        pipelineStarting = false;
        return "Pipeline arrêté.";
    }

    public List<RobotStatusItem> getStatus() {
        return List.of(TCP_PUBLISHER, MOVE_GROUP, INSPECTION_NODE).stream()
                .map(name -> {
                    Process p = runningProcesses.get(name);
                    boolean alive = p != null && p.isAlive();
                    Long pid = alive ? p.pid() : null;
                    return new RobotStatusItem(name, alive, pid);
                })
                .collect(Collectors.toList());
    }

    // ------------------------------------------------------------------

    private boolean isRunning(String name) {
        Process p = runningProcesses.get(name);
        return p != null && p.isAlive();
    }

    private void launchProcess(String name, String shellCommand) {
        try {
            if (isRunning(name)) {
                log.info("{} est déjà en cours d'exécution, on ne relance pas.", name);
                return;
            }

            File logFile = new File(properties.getLogDirectory(), name + ".log");

            ProcessBuilder builder = new ProcessBuilder("bash", "-lc", shellCommand);
            builder.redirectErrorStream(true);
            builder.redirectOutput(ProcessBuilder.Redirect.to(logFile));

            Process process = builder.start();
            runningProcesses.put(name, process);
            log.info("Lancé {} (pid={}) -> log: {}", name, process.pid(), logFile.getAbsolutePath());
        } catch (IOException e) {
            log.error("Impossible de lancer {}", name, e);
            throw new RuntimeException("Impossible de lancer " + name + ": " + e.getMessage(), e);
        }
    }

    private void stopProcess(String name) {
        Process p = runningProcesses.remove(name);
        if (p != null && p.isAlive()) {
            p.descendants().forEach(ProcessHandle::destroy); // tue aussi les sous-process (ros2 launch, etc.)
            p.destroy();
            try {
                if (!p.waitFor(5, TimeUnit.SECONDS)) {
                    p.destroyForcibly();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                p.destroyForcibly();
            }
            log.info("Arrêté {}", name);
        }
    }

    private boolean waitForMoveGroupReady() {
        File logFile = new File(properties.getLogDirectory(), MOVE_GROUP + ".log");
        long deadline = System.currentTimeMillis() + properties.getMoveGroupReadyTimeoutSeconds() * 1000L;

        while (System.currentTimeMillis() < deadline) {
            if (!isRunning(MOVE_GROUP)) {
                log.error("move_group s'est arrêté avant d'être prêt.");
                return false;
            }
            if (logContainsMarker(logFile, properties.getMoveGroupReadyMarker())) {
                return true;
            }
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private boolean logContainsMarker(File logFile, String marker) {
        if (!logFile.exists()) {
            return false;
        }
        try (BufferedReader reader = new BufferedReader(new FileReader(logFile))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains(marker)) {
                    return true;
                }
            }
        } catch (IOException e) {
            log.warn("Lecture du log {} impossible: {}", logFile, e.getMessage());
        }
        return false;
    }

    private void ensureLogDirectory() throws IOException {
        Files.createDirectories(Paths.get(properties.getLogDirectory()));
    }
}
