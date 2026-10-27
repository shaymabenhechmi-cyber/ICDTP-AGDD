package com.agdd.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UserUpdateDto {

    @NotBlank
    private String firstName;

    @NotBlank
    private String lastName;

    @NotBlank
    private String username;

    @NotBlank
    @Email
    private String email;

    /** Optional: if blank/null, password is not changed. */
    private String password;

    private boolean enabled;

    @NotBlank
    private String role;
}
