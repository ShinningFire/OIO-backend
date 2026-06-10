export const tableName = 'event_logs';

export const ddl = `
  CREATE TABLE event_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64),
    conversation_id VARCHAR(64),
    event_type VARCHAR(64) NOT NULL,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_event_type (event_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
