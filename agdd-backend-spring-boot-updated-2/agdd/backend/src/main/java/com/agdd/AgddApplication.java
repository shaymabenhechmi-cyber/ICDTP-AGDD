package com.agdd;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * AGDD - Automated Gear Defect Detection
 * MVP Backend Entry Point.
 *
 * This MVP only implements: JWT Authentication, User Management, Role Management.
 * Future modules (AI Vision, Robot Control, Digital Twin) will be plugged into this
 * architecture later (new controllers/services/entities), without needing to change
 * this foundation.
 */
@SpringBootApplication
public class AgddApplication {

    public static void main(String[] args) {
        SpringApplication.run(AgddApplication.class, args);
    }

}