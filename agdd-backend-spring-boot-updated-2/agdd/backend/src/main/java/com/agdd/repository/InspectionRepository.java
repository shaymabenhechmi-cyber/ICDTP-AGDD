package com.agdd.repository;

import com.agdd.entity.Inspection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface InspectionRepository extends JpaRepository<Inspection, Long> {

    long countByInspectedAtGreaterThanEqual(LocalDateTime start);

    long countByInspectedAtGreaterThanEqualAndStatus(
            LocalDateTime start,
            String status
    );

    List<Inspection> findTop10ByOrderByInspectedAtDesc();

    List<Inspection> findByInspectedAtGreaterThanEqualOrderByInspectedAtAsc(
            LocalDateTime start
    );
}
