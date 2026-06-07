-- User presence for Settings → Active users
ALTER TABLE `users` ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
ADD COLUMN `lastSeenAt` DATETIME(3) NULL;

CREATE INDEX `users_lastSeenAt_idx` ON `users`(`lastSeenAt`);
