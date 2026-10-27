package com.agdd.controller;

import com.agdd.dto.DashboardOverviewDto;
import com.agdd.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/overview")
    public DashboardOverviewDto getOverview(
            @RequestParam(defaultValue = "today") String range
    ) {
        return dashboardService.getOverview(range);
    }
}