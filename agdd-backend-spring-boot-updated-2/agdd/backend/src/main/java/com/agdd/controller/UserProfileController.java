package com.agdd.controller;

import com.agdd.dto.ChangePasswordRequest;
import com.agdd.dto.UpdateProfileRequest;
import com.agdd.dto.UserProfileDto;
import com.agdd.service.EmailAlreadyInUseException;
import com.agdd.service.UserProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users/me")
@RequiredArgsConstructor
public class UserProfileController {

    private final UserProfileService userProfileService;

    @GetMapping
    public ResponseEntity<UserProfileDto> getCurrentProfile(
            Authentication authentication
    ) {
        String username = authentication.getName();

        return ResponseEntity.ok(
                userProfileService.getProfile(username)
        );
    }

    @PutMapping
    public ResponseEntity<UserProfileDto> updateProfile(
            Authentication authentication,
            @RequestBody UpdateProfileRequest request
    ) {
        String username = authentication.getName();

        try {
            return ResponseEntity.ok(
                    userProfileService.updateProfile(
                            username,
                            request
                    )
            );

        } catch (EmailAlreadyInUseException error) {

            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .build();
        }
    }

    @PutMapping("/password")
    public ResponseEntity<Void> changePassword(
            Authentication authentication,
            @RequestBody ChangePasswordRequest request
    ) {
        String username = authentication.getName();

        userProfileService.changePassword(
                username,
                request
        );

        return ResponseEntity.noContent().build();
    }
}
