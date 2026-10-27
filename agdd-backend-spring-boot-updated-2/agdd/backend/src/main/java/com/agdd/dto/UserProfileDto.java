package com.agdd.dto;

public record UserProfileDto(
        Long id,
        String firstName,
        String lastName,
        String email,
        String role
) {
}