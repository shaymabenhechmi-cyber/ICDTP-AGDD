package com.agdd.config;

import com.agdd.entity.Role;
import com.agdd.entity.User;
import com.agdd.repository.RoleRepository;
import com.agdd.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Bootstraps the default roles (ADMIN, OPERATOR, VISITOR) and a default admin
 * account on first startup, so the application is immediately usable.
 */
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        Role admin = roleRepository.findByName("ADMIN").orElseGet(() -> roleRepository.save(new Role("ADMIN")));
        roleRepository.findByName("OPERATOR").orElseGet(() -> roleRepository.save(new Role("OPERATOR")));
        roleRepository.findByName("VISITOR").orElseGet(() -> roleRepository.save(new Role("VISITOR")));

        if (!userRepository.existsByUsername("admin")) {
            User defaultAdmin = User.builder()
                    .firstName("System")
                    .lastName("Administrator")
                    .username("admin")
                    .email("admin@agdd.local")
                    .password(passwordEncoder.encode("Admin@123"))
                    .enabled(true)
                    .role(admin)
                    .build();
            userRepository.save(defaultAdmin);
            System.out.println(">>> Default admin created -> username: admin / password: Admin@123");
        }
    }
}
