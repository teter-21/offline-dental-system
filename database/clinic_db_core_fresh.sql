-- Fresh database schema for core-only dental clinic system
-- Compatible with refactored manual appointment application
-- Administrator account retained from supplied clinic_db.sql (existing password unchanged).
-- MySQL 8+ / MariaDB 10.6+ (prefer MySQL 8)

CREATE DATABASE IF NOT EXISTS `clinic_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `clinic_db`;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE `patients` (
  `id` int NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `age` int DEFAULT NULL,
  `occupation` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` enum('Male','Female') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Single','Married','Widowed','Separated','Divorced','Annulled') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `complain` text COLLATE utf8mb4_unicode_ci,
  `image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` int NOT NULL,
  `fullname` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `appointments` (
  `id` int NOT NULL,
  `patient_id` int DEFAULT NULL,
  `fullname` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `preferred_date` date NOT NULL,
  `preferred_time` time NOT NULL,
  `service` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('Pending','Approved','Rescheduled','Completed','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `visits` (
  `id` int NOT NULL,
  `patient_id` int NOT NULL,
  `visit_date` date DEFAULT NULL,
  `visit_time` time DEFAULT NULL,
  `procedure_name` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `complain` text COLLATE utf8mb4_unicode_ci,
  `description` text COLLATE utf8mb4_unicode_ci,
  `amount_paid` decimal(10,2) DEFAULT '0.00',
  `balance` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dental_chart` (
  `id` int NOT NULL,
  `patient_id` int NOT NULL,
  `visit_id` int DEFAULT NULL,
  `tooth_number` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `condition_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `id` int NOT NULL,
  `visit_id` int NOT NULL,
  `patient_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `paid_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `queue` (
  `id` int NOT NULL,
  `queue_number` int NOT NULL,
  `patient_id` int DEFAULT NULL,
  `appointment_id` int DEFAULT NULL,
  `patient_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue_type` enum('Appointment','Walk-in') COLLATE utf8mb4_unicode_ci NOT NULL,
  `service` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `priority` enum('Normal','Urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Normal',
  `status` enum('Waiting','Called','In Treatment','Completed','Skipped','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Waiting',
  `queue_date` date NOT NULL,
  `check_in_time` datetime DEFAULT NULL,
  `called_at` datetime DEFAULT NULL,
  `treatment_started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `queue_daily_sequence` (
  `queue_date` date NOT NULL,
  `last_number` int UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `auth_sessions` (
  `id` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` int NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `password_reset_tokens` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `security_rate_limits` (
  `bucket_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `window_started` bigint UNSIGNED NOT NULL,
  `hits` int UNSIGNED NOT NULL,
  `last_seen` bigint UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `appointments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_appointments_patient` (`patient_id`),
  ADD KEY `idx_appointments_date` (`preferred_date`),
  ADD KEY `idx_appointments_status` (`status`),
  ADD KEY `idx_appointments_status_date` (`status`,`preferred_date`,`preferred_time`);

ALTER TABLE `auth_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_session_expiry` (`expires_at`),
  ADD KEY `idx_session_user` (`user_id`);

ALTER TABLE `dental_chart`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_dental_chart_patient` (`patient_id`),
  ADD KEY `idx_dental_chart_visit` (`visit_id`),
  ADD KEY `idx_dental_chart_tooth` (`tooth_number`);

ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_password_reset_token` (`token_hash`),
  ADD KEY `idx_password_reset_user` (`user_id`),
  ADD KEY `idx_reset_hash` (`token_hash`);

ALTER TABLE `patients`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_payments_visit` (`visit_id`),
  ADD KEY `idx_payments_patient` (`patient_id`),
  ADD KEY `idx_payments_paid_at` (`paid_at`);

ALTER TABLE `queue`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_queue_date_number` (`queue_date`,`queue_number`),
  ADD KEY `idx_queue_patient` (`patient_id`),
  ADD KEY `idx_queue_appointment` (`appointment_id`),
  ADD KEY `idx_queue_date_status` (`queue_date`,`status`),
  ADD KEY `idx_queue_today` (`queue_date`,`status`,`priority`,`queue_number`);

ALTER TABLE `queue_daily_sequence`
  ADD PRIMARY KEY (`queue_date`);

ALTER TABLE `security_rate_limits`
  ADD PRIMARY KEY (`bucket_key`),
  ADD KEY `idx_rate_cleanup` (`last_seen`);

ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_users_email` (`email`),
  ADD UNIQUE KEY `unique_user_email` (`email`);

ALTER TABLE `visits`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_visits_patient` (`patient_id`),
  ADD KEY `idx_visits_date` (`visit_date`),
  ADD KEY `idx_visits_patient_date` (`patient_id`,`visit_date`);

ALTER TABLE `appointments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

ALTER TABLE `dental_chart`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

ALTER TABLE `password_reset_tokens`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

ALTER TABLE `patients`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

ALTER TABLE `payments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

ALTER TABLE `queue`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `visits`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

ALTER TABLE `appointments`
  ADD CONSTRAINT `fk_appointments_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `auth_sessions`
  ADD CONSTRAINT `fk_auth_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `dental_chart`
  ADD CONSTRAINT `fk_dental_chart_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_dental_chart_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `payments`
  ADD CONSTRAINT `fk_payments_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_payments_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `queue`
  ADD CONSTRAINT `fk_queue_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_queue_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `visits`
  ADD CONSTRAINT `fk_visits_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Initial administrator seed (password: admin12345678 (bcrypt hash)).
INSERT INTO `users` (`id`, `fullname`, `email`, `password`, `role`, `created_at`) VALUES (1, 'Doc Magnus', 'admin@gmail.com', '$2b$12$mzXmnrB2Qxfyy4Dfpg1BHeZ/M.L60PmHa70ewrkUOjWZxXdiEH3Ga', 'admin', CURRENT_TIMESTAMP);

SET FOREIGN_KEY_CHECKS=1;
