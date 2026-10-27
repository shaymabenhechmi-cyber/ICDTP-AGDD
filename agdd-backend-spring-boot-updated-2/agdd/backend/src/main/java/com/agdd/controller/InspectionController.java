package com.agdd.controller;

import com.agdd.dto.InspectionResultRequest;
import com.agdd.entity.Inspection;
import com.agdd.repository.InspectionRepository;
import com.agdd.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/inspection")
@RequiredArgsConstructor
public class InspectionController {

    private final InspectionRepository inspectionRepository;
    private final NotificationService notificationService;

    @PostMapping("/results")
    public ResponseEntity<Inspection> receiveResult(
            @RequestBody InspectionResultRequest request) {

        Inspection inspection = new Inspection();

        inspection.setPieceId(request.getPieceId());
        inspection.setStatus(request.getStatus());
        inspection.setDefectType(request.getDefectType());
        inspection.setTopStatus(request.getTopStatus());
        inspection.setSideStatus(request.getSideStatus());

        inspection.setOuterDiameter(request.getOuterDiameter());
        inspection.setInnerDiameter(request.getInnerDiameter());
        inspection.setTeethCount(request.getTeethCount());
        inspection.setHeightMm(request.getHeightMm());
        inspection.setHelixDeg(request.getHelixDeg());

        inspection.setInspectedAt(LocalDateTime.now());

        Inspection saved =
                inspectionRepository.save(inspection);

        /*
         * Immediately trigger realtime notifications
         * after the inspection has been persisted.
         */
        notificationService.processNewInspection(saved);

        return ResponseEntity.ok(saved);
    }
}
