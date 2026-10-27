package com.agdd.repository;

import com.agdd.entity.Notification;
import com.agdd.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findTop30ByUserOrderByCreatedAtDesc(User user);

    long countByUserAndReadFalse(User user);

    List<Notification> findByUserAndReadFalseOrderByCreatedAtDesc(User user);

    boolean existsByUserAndEventKey(User user, String eventKey);

    @Transactional
    void deleteByUser(User user);
}