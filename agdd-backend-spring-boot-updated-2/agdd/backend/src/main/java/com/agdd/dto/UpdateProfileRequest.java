package com.agdd.dto;

public record UpdateProfileRequest(
        String firstName,
        String lastName,
        String email
) {
}