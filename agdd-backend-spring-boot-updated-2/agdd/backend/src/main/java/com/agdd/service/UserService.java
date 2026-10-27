package com.agdd.service;

import com.agdd.dto.UserCreateDto;
import com.agdd.dto.UserDto;
import com.agdd.dto.UserUpdateDto;
import com.agdd.entity.Role;
import com.agdd.entity.User;
import com.agdd.exception.ResourceNotFoundException;
import com.agdd.repository.NotificationRepository;
import com.agdd.repository.RoleRepository;
import com.agdd.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final NotificationRepository notificationRepository;
    private final PasswordEncoder passwordEncoder;

    public List<UserDto> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::toDto)
                .toList();
    }

    public UserDto getUserById(Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "User not found with id: " + id
                        )
                );

        return toDto(user);
    }

    public UserDto createUser(UserCreateDto dto) {

        if (userRepository.existsByUsername(dto.getUsername())) {
            throw new IllegalArgumentException(
                    "Username already exists: " + dto.getUsername()
            );
        }

        if (userRepository.existsByEmail(dto.getEmail())) {
            throw new IllegalArgumentException(
                    "Email already exists: " + dto.getEmail()
            );
        }

        Role role = roleRepository.findByName(dto.getRole())
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Role not found: " + dto.getRole()
                        )
                );

        User user = User.builder()
                .firstName(dto.getFirstName())
                .lastName(dto.getLastName())
                .username(dto.getUsername())
                .email(dto.getEmail())
                .password(passwordEncoder.encode(dto.getPassword()))
                .enabled(dto.isEnabled())
                .role(role)
                .build();

        return toDto(userRepository.save(user));
    }

    public UserDto updateUser(Long id, UserUpdateDto dto) {

        User user = userRepository.findById(id)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "User not found with id: " + id
                        )
                );

        Role role = roleRepository.findByName(dto.getRole())
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Role not found: " + dto.getRole()
                        )
                );

        user.setFirstName(dto.getFirstName());
        user.setLastName(dto.getLastName());
        user.setUsername(dto.getUsername());
        user.setEmail(dto.getEmail());
        user.setEnabled(dto.isEnabled());
        user.setRole(role);

        if (dto.getPassword() != null &&
                !dto.getPassword().isBlank()) {

            user.setPassword(
                    passwordEncoder.encode(dto.getPassword())
            );
        }

        return toDto(userRepository.save(user));
    }

    @Transactional
    public void deleteUser(Long id) {

        User user = userRepository.findById(id)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "User not found with id: " + id
                        )
                );

        // Delete notifications first because of the foreign key.
        notificationRepository.deleteByUser(user);

        // Then delete the user.
        userRepository.delete(user);
    }

    private UserDto toDto(User user) {

        return new UserDto(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getUsername(),
                user.getEmail(),
                user.isEnabled(),
                user.getRole().getName()
        );
    }
}