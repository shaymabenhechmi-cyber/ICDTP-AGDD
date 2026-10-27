package com.agdd.dto;

import lombok.Data;

@Data
public class InspectionResultRequest {

    private String pieceId;

    private String status;

    private String defectType;

    private String topStatus;

    private String sideStatus;

    private Double outerDiameter;

    private Double innerDiameter;

    private Integer teethCount;

    private Double heightMm;

    private Double helixDeg;
}
