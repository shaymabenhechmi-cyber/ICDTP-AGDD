package com.agdd.service;

import com.agdd.dto.LoginRequest;
import com.agdd.dto.LoginResponse;
import com.agdd.dto.RegisterRequest;
import com.agdd.entity.Role;
import com.agdd.entity.User;
import com.agdd.repository.RoleRepository;
import com.agdd.repository.UserRepository;
import com.agdd.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    // Gère la vérification du username et du password
    private final AuthenticationManager authenticationManager;
    // Permet de récupérer les informations de l'utilisateur depuis la base
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    // Rôle attribué par défaut aux comptes créés via l'auto-inscription (signup public)
    private static final String DEFAULT_SIGNUP_ROLE = "VISITOR";

    public LoginResponse login(LoginRequest request) {

        // ==========================================
        // 1. Vérifier le username et le password
        // ==========================================
        // AuthenticationManager compare le mot de passe envoyé
        // avec celui stocké dans la base (grâce à BCrypt).
        // Si les identifiants sont faux, Spring lance automatiquement
        // une exception (BadCredentialsException) et le code s'arrête ici.
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
        );


        // ==========================================
        // 2. Récupérer l'utilisateur depuis la base
        // ==========================================
        // Après une authentification réussie, on récupère toutes
        // les informations de l'utilisateur (id, email, rôle...).

        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalStateException("User not found after authentication"));



        // ==========================================
        // 3. Construire un objet UserDetails
        // ==========================================
        // JwtUtil a besoin d'un UserDetails pour créer le token.
        // On transforme donc notre entité User en UserDetails.

        UserDetails userDetails = org.springframework.security.core.userdetails.User
                .withUsername(user.getUsername())
                .password(user.getPassword())
                .authorities("ROLE_" + user.getRole().getName())
                .build();

        // ==========================================
        // 4. Générer le JWT
        // ==========================================
        // Le token contient notamment le username
        // et une date d'expiration.

        String token = jwtUtil.generateToken(userDetails);


        // ==========================================
        // 5. Retourner les informations au frontend
        // ==========================================
        // Le frontend recevra :
        // - le token JWT
        // - les informations de l'utilisateur
        // Il stockera ensuite le token pour l'envoyer
        // dans les prochaines requêtes.

        return new LoginResponse(
                token,
                user.getId(),
                user.getUsername(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole().getName()
        );
    }

    // ==========================================
    // Auto-inscription (self-service sign up)
    // ==========================================
    // Crée un nouveau compte avec le rôle par défaut (VISITOR),
    // puis connecte automatiquement l'utilisateur en renvoyant un JWT,
    // exactement comme le fait login().
    public LoginResponse register(RegisterRequest request) {

        if (userRepository.existsByUsername(request.getUsername())) {
            throw new IllegalArgumentException("Username already exists: " + request.getUsername());
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already exists: " + request.getEmail());
        }

        Role role = roleRepository.findByName(DEFAULT_SIGNUP_ROLE)
                .orElseThrow(() -> new IllegalStateException("Default role not found: " + DEFAULT_SIGNUP_ROLE));

        User user = User.builder()
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .username(request.getUsername())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .enabled(true)
                .role(role)
                .build();

        userRepository.save(user);

        UserDetails userDetails = org.springframework.security.core.userdetails.User
                .withUsername(user.getUsername())
                .password(user.getPassword())
                .authorities("ROLE_" + user.getRole().getName())
                .build();

        String token = jwtUtil.generateToken(userDetails);

        return new LoginResponse(
                token,
                user.getId(),
                user.getUsername(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole().getName()
        );
    }
}
