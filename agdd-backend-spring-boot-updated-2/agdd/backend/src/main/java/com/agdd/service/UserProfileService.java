package com.agdd.service;

import com.agdd.dto.ChangePasswordRequest;
import com.agdd.dto.UpdateProfileRequest;
import com.agdd.dto.UserProfileDto;
import com.agdd.entity.User;
import com.agdd.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserProfileService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserProfileDto getProfile(String username) {
        User user = findUserByUsername(username);
        return toDto(user);
    }

    @Transactional
    public UserProfileDto updateProfile(
            String currentUsername,
            UpdateProfileRequest request
    ) {
        User user = findUserByUsername(currentUsername);

        String newEmail = request.email().trim();

        if (!user.getEmail().equalsIgnoreCase(newEmail)
                && userRepository.existsByEmail(newEmail)) {

            throw new EmailAlreadyInUseException(
        "This email address is already associated with another account."
);
        }

        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setEmail(newEmail);

        User saved = userRepository.save(user);

        return toDto(saved);
    }

    @Transactional
    public void changePassword(
            String username,
            ChangePasswordRequest request
    ) {
        User user = findUserByUsername(username);

        if (!passwordEncoder.matches(
                request.currentPassword(),
                user.getPassword()
        )) {
            throw new IllegalArgumentException(
                    "Current password is incorrect"
            );
        }

        if (request.newPassword() == null
                || request.newPassword().length() < 8) {

            throw new IllegalArgumentException(
                    "New password must contain at least 8 characters"
            );
        }

        user.setPassword(
                passwordEncoder.encode(request.newPassword())
        );

        userRepository.save(user);
    }

    private User findUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() ->
                        new IllegalStateException(
                                "User not found: " + username
                        )
                );
    }

    private UserProfileDto toDto(User user) {
        return new UserProfileDto(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole() != null
                        ? user.getRole().getName()
                        : "UNKNOWN"
        );
    }
}