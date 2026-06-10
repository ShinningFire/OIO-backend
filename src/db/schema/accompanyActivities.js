export const tableName = 'accompany_activities';

export const ddl = `
  CREATE TABLE accompany_activities (
    activity_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    accompany_mode VARCHAR(64) NOT NULL,
    accompany_character VARCHAR(64) NOT NULL,
    accompany_start_time DATETIME NOT NULL,
    accompany_end_time DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_character (accompany_character),
    INDEX idx_start_time (accompany_start_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
