package com.agdd.dto;

public record ChangePasswordRequest(
        String currentPassword,
        String newPassword
) {
}