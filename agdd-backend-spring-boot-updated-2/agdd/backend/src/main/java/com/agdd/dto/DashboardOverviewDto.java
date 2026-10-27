package com.agdd.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Real dashboard payload.
 *
 * All inspection-related values are retrieved from the database
 * through DashboardService.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DashboardOverviewDto {

    private KpiDto kpis;

    private List<TrendPointDto> trend7d;

    private List<TrendPointDto> trend30d;

    private List<DefectTypeDto> defectTypes;

    private List<ActivityItemDto> activity;

    private List<EquipmentStatusDto> equipment;

    private List<AlertDto> alerts;

    private ProductionDto production;

    private List<ShiftPerformanceDto> shifts;

    private int healthScore;


    // ================================================================
    // KPI
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class KpiDto {

        /**
         * Number of confirmed inspections in the selected period.
         *
         * OK + DEFECT
         *
         * UNCERTAIN is excluded.
         */
        private int piecesInspectedToday;

        /**
         * Number of defective inspections in the selected period.
         */
        private int defectsDetectedToday;

        /**
         * Percentage of healthy gears among confirmed inspections.
         */
        private double conformityRate;

        /**
         * Total confirmed inspections.
         *
         * Added for the dashboard.
         */
        private int totalInspected;

        /**
         * Healthy gears.
         */
        private int healthy;

        /**
         * Defective gears.
         */
        private int defective;

        /**
         * Quality percentage.
         */
        private double qualityRate;

        /**
         * Defective percentage.
         */
        private double defectRate;
    }


    // ================================================================
    // TREND
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrendPointDto {

        /**
         * Date format:
         * yyyy-MM-dd
         */
        private String date;

        /**
         * Confirmed inspections:
         * OK + DEFECT
         *
         * UNCERTAIN excluded.
         */
        private int inspected;

        /**
         * Defective inspections.
         */
        private int defects;
    }


    // ================================================================
    // DEFECT TYPES
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DefectTypeDto {

        /**
         * Example:
         * Defect_Gear
         */
        private String type;

        /**
         * Number of occurrences.
         */
        private int count;
    }


    // ================================================================
    // INSPECTION RECORD
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ActivityItemDto {

        /**
         * Professional dashboard ID.
         *
         * Example:
         * INS-000001
         */
        private String inspectionId;

        /**
         * Real piece ID stored in database.
         *
         * Example:
         * GEAR-20260917-005320-0
         */
        private String pieceId;

        /**
         * OK / DEFECT / UNCERTAIN
         */
        private String status;

        /**
         * Example:
         * Defect_Gear
         */
        private String defectType;

        /**
         * Formatted inspection date/time.
         *
         * Example:
         * 16/09/2026 23:53:30
         */
        private String inspectedAt;

        /**
         * Outer diameter in mm.
         */
        private Double outerDiameter;

        /**
         * Inner diameter in mm.
         */
        private Double innerDiameter;

        /**
         * Number of teeth.
         */
        private Integer teethCount;

        /**
         * Gear height in mm.
         */
        private Double heightMm;

        /**
         * Helix angle in degrees.
         */
        private Double helixDeg;

        /**
         * Top camera result.
         *
         * Example:
         * OK / Defected / Uncertain
         */
        private String topStatus;

        /**
         * Side camera result.
         *
         * Example:
         * OK / Defected / Uncertain
         */
        private String sideStatus;
    }


    // ================================================================
    // EQUIPMENT
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EquipmentStatusDto {

        private String name;

        /**
         * ONLINE | OFFLINE | WARNING
         */
        private String status;
    }


    // ================================================================
    // ALERT
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AlertDto {

        private String message;

        /**
         * INFO | WARNING | CRITICAL
         */
        private String level;

        private String time;
    }


    // ================================================================
    // PRODUCTION
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProductionDto {

        private double lineSpeedPiecesPerMinute;

        private int targetPiecesPerMinute;
    }


    // ================================================================
    // SHIFT
    // ================================================================

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ShiftPerformanceDto {

        /**
         * Morning | Afternoon | Night
         */
        private String shift;

        private double conformityRate;

        private int piecesInspected;
    }
}