package com.agdd.service;

import com.agdd.dto.DashboardOverviewDto;
import com.agdd.entity.Inspection;
import com.agdd.repository.InspectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final InspectionRepository inspectionRepository;

    private static final DateTimeFormatter TIME_FORMAT =
            DateTimeFormatter.ofPattern("HH:mm:ss");

    private static final DateTimeFormatter DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private static final DateTimeFormatter DATETIME_FORMAT =
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");


    // ================================================================
    // PUBLIC METHODS
    // ================================================================

    public DashboardOverviewDto getOverview() {
        return getOverview("today");
    }


    public DashboardOverviewDto getOverview(String range) {

        LocalDateTime now = LocalDateTime.now();

        // ============================================================
        // 1. SELECTED PERIOD
        // ============================================================

        LocalDateTime start =
                calculateStart(range, now);

        List<Inspection> periodInspections =
                inspectionRepository
                        .findByInspectedAtGreaterThanEqualOrderByInspectedAtAsc(
                                start
                        );

        if (periodInspections == null) {
            periodInspections = new ArrayList<>();
        }


        // ============================================================
        // 2. CONFIRMED INSPECTIONS
        //
        // CONFIRMED = OK + DEFECT
        //
        // UNCERTAIN is NOT counted.
        // ============================================================

        List<Inspection> confirmed =
                periodInspections.stream()
                        .filter(Objects::nonNull)
                        .filter(this::isConfirmed)
                        .toList();


        // ============================================================
        // 3. SELECTED PERIOD KPI
        // ============================================================

        int total =
                confirmed.size();

        int healthy =
                (int) confirmed.stream()
                        .filter(this::isHealthy)
                        .count();

        int defects =
                (int) confirmed.stream()
                        .filter(this::isDefect)
                        .count();


        double qualityRate =
                calculatePercentage(
                        healthy,
                        total
                );

        double defectRate =
                calculatePercentage(
                        defects,
                        total
                );


        // ============================================================
        // 4. KPI DTO
        //
        // All values here correspond to the SELECTED RANGE.
        //
        // Example:
        //
        // Today -> today's records
        // 7d    -> last 7 days
        // 30d   -> last 30 days
        // ============================================================

        DashboardOverviewDto.KpiDto kpis =
                new DashboardOverviewDto.KpiDto(

                        total,

                        defects,

                        qualityRate,

                        total,

                        healthy,

                        defects,

                        qualityRate,

                        defectRate
                );


        // ============================================================
        // 5. TRENDS
        //
        // Always based on REAL DATABASE records.
        //
        // UNCERTAIN ignored.
        // ============================================================

        List<Inspection> last7Days =
                getInspectionsSince(
                        now.minusDays(6)
                                .toLocalDate()
                                .atStartOfDay()
                );


        List<Inspection> last30Days =
                getInspectionsSince(
                        now.minusDays(29)
                                .toLocalDate()
                                .atStartOfDay()
                );


        List<DashboardOverviewDto.TrendPointDto> trend7d =
                buildTrend(
                        last7Days,
                        7,
                        now
                );


        List<DashboardOverviewDto.TrendPointDto> trend30d =
                buildTrend(
                        last30Days,
                        30,
                        now
                );


        // ============================================================
        // 6. DEFECT ANALYSIS
        //
        // Only DEFECT inspections.
        // UNCERTAIN ignored.
        // ============================================================

        List<DashboardOverviewDto.DefectTypeDto> defectTypes =
                buildDefectTypes(
                        confirmed
                );


        // ============================================================
        // 7. INSPECTION TABLE
        //
        // IMPORTANT:
        //
        // We KEEP UNCERTAIN.
        //
        // The table represents records stored in the DB,
        // not only confirmed KPI records.
        //
        // Sorted:
        // newest -> oldest
        //
        // No .limit(10), therefore all selected-period records
        // are returned.
        // ============================================================

        List<DashboardOverviewDto.ActivityItemDto> activity =
                periodInspections.stream()

                        .filter(Objects::nonNull)

                        .sorted(
                                Comparator.comparing(
                                        Inspection::getInspectedAt,
                                        Comparator.nullsLast(
                                                Comparator.reverseOrder()
                                        )
                                )
                        )

                        .map(this::toActivity)

                        .toList();


        // ============================================================
        // 8. EQUIPMENT
        // ============================================================

        List<DashboardOverviewDto.EquipmentStatusDto> equipment =
                List.of(

                        new DashboardOverviewDto.EquipmentStatusDto(
                                "Inspection System",
                                "ONLINE"
                        ),

                        new DashboardOverviewDto.EquipmentStatusDto(
                                "Database",
                                "ONLINE"
                        )
                );


        // ============================================================
        // 9. ALERTS
        // ============================================================

        List<DashboardOverviewDto.AlertDto> alerts =
                buildAlerts(
                        confirmed
                );


        // ============================================================
        // 10. PRODUCTION
        // ============================================================

        double productionSpeed =
                calculateProductionSpeed(
                        confirmed
                );


        DashboardOverviewDto.ProductionDto production =
                new DashboardOverviewDto.ProductionDto(
                        productionSpeed,
                        10
                );


        // ============================================================
        // 11. SHIFTS
        // ============================================================

        List<DashboardOverviewDto.ShiftPerformanceDto> shifts =
                buildShifts(
                        confirmed
                );


        // ============================================================
        // 12. HEALTH SCORE
        //
        // Confirmed records only.
        // ============================================================

        int healthScore =
                (int) Math.round(
                        qualityRate
                );


        // ============================================================
        // 13. FINAL RESPONSE
        // ============================================================

        DashboardOverviewDto dto =
                new DashboardOverviewDto();

        dto.setKpis(kpis);

        dto.setTrend7d(trend7d);

        dto.setTrend30d(trend30d);

        dto.setDefectTypes(defectTypes);

        dto.setActivity(activity);

        dto.setEquipment(equipment);

        dto.setAlerts(alerts);

        dto.setProduction(production);

        dto.setShifts(shifts);

        dto.setHealthScore(
                healthScore
        );

        return dto;
    }


    // ================================================================
    // RANGE
    // ================================================================

    private LocalDateTime calculateStart(
            String range,
            LocalDateTime now
    ) {

        if (range == null
                || range.trim().isEmpty()) {

            return now
                    .toLocalDate()
                    .atStartOfDay();
        }


        return switch (
                range.trim().toLowerCase(Locale.ROOT)
                ) {

            case "1h" ->
                    now.minusHours(1);

            case "24h" ->
                    now.minusHours(24);

            case "7d" ->
                    now.minusDays(7);

            case "30d" ->
                    now.minusDays(30);

            case "today" ->
                    now.toLocalDate().atStartOfDay();

            default ->
                    now.toLocalDate().atStartOfDay();
        };
    }


    // ================================================================
    // DATABASE
    // ================================================================

    private List<Inspection> getInspectionsSince(
            LocalDateTime start
    ) {

        List<Inspection> result =
                inspectionRepository
                        .findByInspectedAtGreaterThanEqualOrderByInspectedAtAsc(
                                start
                        );

        if (result == null) {
            return new ArrayList<>();
        }

        return result;
    }


    // ================================================================
    // STATUS
    // ================================================================

    private String normalizeStatus(
            String status
    ) {

        if (status == null) {
            return "";
        }

        return status
                .trim()
                .toUpperCase(Locale.ROOT);
    }


    private boolean isHealthy(
            Inspection inspection
    ) {

        if (inspection == null) {
            return false;
        }

        return "OK".equals(
                normalizeStatus(
                        inspection.getStatus()
                )
        );
    }


    private boolean isDefect(
            Inspection inspection
    ) {

        if (inspection == null) {
            return false;
        }

        String status =
                normalizeStatus(
                        inspection.getStatus()
                );

        return "DEFECT".equals(status)
                || "DEFECTED".equals(status)
                || "DEFECTIVE".equals(status)
                || "NOK".equals(status)
                || "REJECT".equals(status)
                || "REJECTED".equals(status);
    }


    private boolean isUncertain(
            Inspection inspection
    ) {

        if (inspection == null) {
            return false;
        }

        String status =
                normalizeStatus(
                        inspection.getStatus()
                );

        return "UNCERTAIN".equals(status)
                || "UNKNOWN".equals(status);
    }


    private boolean isConfirmed(
            Inspection inspection
    ) {

        return isHealthy(inspection)
                || isDefect(inspection);
    }


    // ================================================================
    // PERCENTAGE
    // ================================================================

    private double calculatePercentage(
            int value,
            int total
    ) {

        if (total <= 0) {
            return 0.0;
        }

        return (
                value * 100.0
        ) / total;
    }


    // ================================================================
    // TREND
    // ================================================================

    private List<DashboardOverviewDto.TrendPointDto> buildTrend(
            List<Inspection> inspections,
            int days,
            LocalDateTime now
    ) {

        List<DashboardOverviewDto.TrendPointDto> result =
                new ArrayList<>();


        LocalDate today =
                now.toLocalDate();


        for (int i = days - 1; i >= 0; i--) {

            LocalDate date =
                    today.minusDays(i);


            int inspected = 0;

            int defects = 0;


            if (inspections != null) {

                for (Inspection inspection : inspections) {

                    if (inspection == null) {
                        continue;
                    }


                    if (inspection.getInspectedAt() == null) {
                        continue;
                    }


                    LocalDate inspectionDate =
                            inspection
                                    .getInspectedAt()
                                    .toLocalDate();


                    if (!inspectionDate.equals(date)) {
                        continue;
                    }


                    /*
                     * UNCERTAIN / UNKNOWN ignored.
                     */
                    if (!isConfirmed(inspection)) {
                        continue;
                    }


                    inspected++;


                    if (isDefect(inspection)) {
                        defects++;
                    }
                }
            }


            result.add(
                    new DashboardOverviewDto.TrendPointDto(
                            date.format(DATE_FORMAT),
                            inspected,
                            defects
                    )
            );
        }


        return result;
    }


    // ================================================================
    // DEFECT TYPES
    // ================================================================

    private List<DashboardOverviewDto.DefectTypeDto> buildDefectTypes(
            List<Inspection> confirmed
    ) {

        if (confirmed == null
                || confirmed.isEmpty()) {

            return new ArrayList<>();
        }


        Map<String, Long> grouped =
                confirmed.stream()

                        .filter(Objects::nonNull)

                        .filter(this::isDefect)

                        .filter(
                                inspection ->
                                        inspection.getDefectType() != null
                                                && !inspection
                                                .getDefectType()
                                                .trim()
                                                .isEmpty()
                        )

                        .collect(
                                Collectors.groupingBy(

                                        inspection ->
                                                inspection
                                                        .getDefectType()
                                                        .trim(),

                                        LinkedHashMap::new,

                                        Collectors.counting()
                                )
                        );


        return grouped.entrySet()
                .stream()

                .map(
                        entry ->
                                new DashboardOverviewDto.DefectTypeDto(
                                        entry.getKey(),
                                        entry.getValue().intValue()
                                )
                )

                .toList();
    }


    // ================================================================
    // ACTIVITY / TABLE
    // ================================================================

    private DashboardOverviewDto.ActivityItemDto toActivity(
            Inspection inspection
    ) {

        if (inspection == null) {

            return new DashboardOverviewDto.ActivityItemDto(
                    "—",
                    "—",
                    "UNKNOWN",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
            );
        }


        // ------------------------------------------------------------
        // INSPECTION ID
        // ------------------------------------------------------------

        String inspectionId =
                inspection.getId() != null

                        ? String.format(
                        "INS-%06d",
                        inspection.getId()
                )

                        : "—";


        // ------------------------------------------------------------
        // DATE / TIME
        // ------------------------------------------------------------

        String inspectedAt = null;


        if (inspection.getInspectedAt() != null) {

            inspectedAt =
                    inspection
                            .getInspectedAt()
                            .format(
                                    DATETIME_FORMAT
                            );
        }


        // ------------------------------------------------------------
        // REAL DATABASE VALUES
        // ------------------------------------------------------------

        return new DashboardOverviewDto.ActivityItemDto(

                // 1. Inspection ID
                inspectionId,

                // 2. Gear ID / piece_id
                inspection.getPieceId(),

                // 3. Global status
                inspection.getStatus(),

                // 4. Defect type
                inspection.getDefectType(),

                // 5. Date/time
                inspectedAt,

                // 6. Outer diameter
                inspection.getOuterDiameter(),

                // 7. Inner diameter
                inspection.getInnerDiameter(),

                // 8. Teeth
                inspection.getTeethCount(),

                // 9. Height
                inspection.getHeightMm(),

                // 10. Helix
                inspection.getHelixDeg(),

                // 11. Top status
                inspection.getTopStatus(),

                // 12. Side status
                inspection.getSideStatus()
        );
    }


    // ================================================================
    // PRODUCTION SPEED
    // ================================================================

    private double calculateProductionSpeed(
            List<Inspection> confirmed
    ) {

        if (confirmed == null
                || confirmed.isEmpty()) {

            return 0.0;
        }


        List<Inspection> sorted =
                confirmed.stream()

                        .filter(Objects::nonNull)

                        .filter(
                                inspection ->
                                        inspection.getInspectedAt() != null
                        )

                        .sorted(
                                Comparator.comparing(
                                        Inspection::getInspectedAt
                                )
                        )

                        .toList();


        if (sorted.size() < 2) {
            return 0.0;
        }


        LocalDateTime first =
                sorted
                        .get(0)
                        .getInspectedAt();


        LocalDateTime last =
                sorted
                        .get(sorted.size() - 1)
                        .getInspectedAt();


        long seconds =
                Duration
                        .between(
                                first,
                                last
                        )
                        .getSeconds();


        if (seconds <= 0) {
            return 0.0;
        }


        return (
                sorted.size() * 60.0
        ) / seconds;
    }


    // ================================================================
    // ALERTS
    // ================================================================

    private List<DashboardOverviewDto.AlertDto> buildAlerts(
            List<Inspection> confirmed
    ) {

        List<DashboardOverviewDto.AlertDto> alerts =
                new ArrayList<>();


        if (confirmed == null
                || confirmed.isEmpty()) {

            return alerts;
        }


        long defects =
                confirmed.stream()

                        .filter(Objects::nonNull)

                        .filter(this::isDefect)

                        .count();


        if (defects > 0) {

            alerts.add(
                    new DashboardOverviewDto.AlertDto(

                            defects
                                    + " defective gear(s) detected",

                            "WARNING",

                            LocalDateTime
                                    .now()
                                    .format(TIME_FORMAT)
                    )
            );
        }


        return alerts;
    }


    // ================================================================
    // SHIFTS
    // ================================================================

    private List<DashboardOverviewDto.ShiftPerformanceDto> buildShifts(
            List<Inspection> confirmed
    ) {

        if (confirmed == null) {
            confirmed = new ArrayList<>();
        }


        Map<String, List<Inspection>> byShift =
                confirmed.stream()

                        .filter(Objects::nonNull)

                        .filter(
                                inspection ->
                                        inspection.getInspectedAt() != null
                        )

                        .collect(
                                Collectors.groupingBy(

                                        this::getShift,

                                        LinkedHashMap::new,

                                        Collectors.toList()
                                )
                        );


        List<String> shiftNames =
                List.of(
                        "Morning",
                        "Afternoon",
                        "Night"
                );


        List<DashboardOverviewDto.ShiftPerformanceDto> result =
                new ArrayList<>();


        for (String shift : shiftNames) {

            List<Inspection> list =
                    byShift.getOrDefault(
                            shift,
                            Collections.emptyList()
                    );


            int total =
                    list.size();


            int healthy =
                    (int) list.stream()
                            .filter(this::isHealthy)
                            .count();


            double rate =
                    calculatePercentage(
                            healthy,
                            total
                    );


            result.add(
                    new DashboardOverviewDto.ShiftPerformanceDto(
                            shift,
                            rate,
                            total
                    )
            );
        }


        return result;
    }


    // ================================================================
    // SHIFT
    // ================================================================

    private String getShift(
            Inspection inspection
    ) {

        if (inspection == null
                || inspection.getInspectedAt() == null) {

            return "Unknown";
        }


        int hour =
                inspection
                        .getInspectedAt()
                        .getHour();


        if (hour >= 6 && hour < 14) {
            return "Morning";
        }


        if (hour >= 14 && hour < 22) {
            return "Afternoon";
        }


        return "Night";
    }
}