package com.agdd.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "inspections")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Inspection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "piece_id", length = 100)
    private String pieceId;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "defect_type", length = 100)
    private String defectType;

    @Column(name = "top_status", length = 50)
    private String topStatus;

    @Column(name = "side_status", length = 50)
    private String sideStatus;

    @Column(name = "outer_diameter")
    private Double outerDiameter;

    @Column(name = "inner_diameter")
    private Double innerDiameter;

    @Column(name = "teeth_count")
    private Integer teethCount;

    @Column(name = "height_mm")
    private Double heightMm;

    @Column(name = "helix_deg")
    private Double helixDeg;

    @Column(name = "inspected_at", nullable = false)
    private LocalDateTime inspectedAt;
}
