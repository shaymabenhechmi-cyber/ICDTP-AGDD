package com.agdd.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private final ObjectProvider<JavaMailSender> mailSenderProvider;

    public EmailService(ObjectProvider<JavaMailSender> mailSenderProvider) {
        this.mailSenderProvider = mailSenderProvider;
    }

    public void sendNotificationEmail(
            String recipient,
            String title,
            String message
    ) {

        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();

        if (mailSender == null) {
            System.err.println(
                    "[AGDD] Email service is not configured. Notification email skipped."
            );
            return;
        }

        SimpleMailMessage email = new SimpleMailMessage();

        email.setTo(recipient);
        email.setSubject("[AGDD] " + title);

        email.setText(
                """
                AGDD Industry 4.0 Platform

                %s

                %s

                This is an automatic notification from the AGDD system.
                """.formatted(
                        title,
                        message
                )
        );

        mailSender.send(email);
    }
}